"""Shared fixtures for the test suite."""

from contextlib import contextmanager
from dataclasses import replace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.main import app as fastapi_app
from app.main import backend_app
from backend.core.database import get_session
from backend.services import (
    get_service_container_builder,
    service_container_builder_scope,
)
from backend.services.adapters import AdapterService
from backend.services.analytics_repository import AnalyticsRepository
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService
from backend.services.delivery_repository import DeliveryJobRepository
from backend.services.in_process_jobs import get_in_process_job_runner
from backend.services.providers.generation import make_compose_service
from backend.services.queue import create_queue_orchestrator
from tests.util.in_process_jobs import InProcessJobGate
from tests.util.service_container import reset_service_container_builder


@pytest.fixture
def anyio_backend():
    """Force AnyIO tests to execute using the asyncio backend."""
    return "asyncio"


@pytest.fixture(autouse=True)
def isolated_service_container_builder():
    """Provide an isolated and freshly reset service container builder per test."""

    with service_container_builder_scope() as builder:
        reset_service_container_builder(builder)
        try:
            yield
        finally:
            reset_service_container_builder(builder)


@pytest.fixture(autouse=True)
def no_lifespan_job_recovery(monkeypatch):
    """Keep the lifespan's job recovery away from the configured database.

    Tests that enter the real lifespan would otherwise fail and requeue jobs in
    the developer's database. ``tests/services/test_job_recovery.py`` drives
    :class:`JobRecovery` directly.
    """
    from backend.services.job_recovery import JobRecovery

    monkeypatch.setattr(JobRecovery, "start", lambda self: None)


@pytest.fixture(autouse=True)
def stop_in_process_jobs():
    """Stop the process-wide in-process job runner after each test.

    A job a test left queued would otherwise run during the next test.
    ``db_session`` also stops it, before it restores the real engine.
    """
    yield
    get_in_process_job_runner().stop()


@pytest.fixture(name="mock_storage")
def mock_storage_fixture(monkeypatch) -> MagicMock:
    """Mock storage adapter fixture that patches storage functions.

    Tests can set `mock_storage.exists.return_value` and the patch will cause
    both legacy and new storage systems to use the mock.
    """
    mock = MagicMock()

    # The legacy compatibility modules have been removed
    # All mocking is now handled through the new app structure

    # Create a mock storage backend
    mock_backend = MagicMock()
    mock_backend.file_exists.side_effect = lambda path: mock.exists(path)

    # Create a mock storage service that uses our mock backend
    mock_storage_service = MagicMock()
    mock_storage_service.backend = mock_backend
    mock_storage_service.validate_file_path.side_effect = lambda path: mock.exists(path)

    # Patch the default builder to reuse the mock storage service
    from backend.services import get_service_container_builder

    builder = get_service_container_builder()

    monkeypatch.setattr(
        builder,
        "_factories",
        replace(builder._factories, storage=lambda: mock_storage_service),
    )

    mock.storage_service = mock_storage_service
    return mock


@pytest.fixture(name="db_session")
def db_session_fixture():
    """Pytest fixture for an in-memory SQLite database session.

    Creates a new database for each test function and yields a session.
    """
    from backend import models  # noqa: F401  # Ensure models populate SQLModel metadata

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    from backend.core import database as core_database

    original_engine = core_database.ENGINE
    core_database.ENGINE = engine
    SQLModel.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            yield session
    finally:
        # Stop in-process jobs before the real engine comes back.
        get_in_process_job_runner().stop()
        core_database.ENGINE = original_engine


@pytest.fixture
def adapter_service(db_session: Session, mock_storage) -> AdapterService:
    """AdapterService fixture using the new modular service."""
    # Use the mocked storage service
    builder = get_service_container_builder()
    services = builder.build(
        db_session,
        analytics_repository=AnalyticsRepository(db_session),
        recommendation_gpu_available=False,
    )
    return services.adapters


@pytest.fixture
def delivery_service(db_session: Session, mock_storage) -> DeliveryService:
    """DeliveryService fixture using the new modular service."""
    builder = get_service_container_builder()
    services = builder.build(
        db_session,
        queue_orchestrator=create_queue_orchestrator(),
        delivery_repository=DeliveryJobRepository(db_session),
        analytics_repository=AnalyticsRepository(db_session),
        recommendation_gpu_available=False,
    )
    return services.deliveries


@pytest.fixture
def compose_service() -> ComposeService:
    """ComposeService fixture using the new modular service."""
    return make_compose_service()


@pytest.fixture
def in_process_jobs(db_session: Session) -> InProcessJobGate:
    """Hold in-process delivery jobs until the test runs them.

    Call ``in_process_jobs.run_queued_jobs()`` once the requests that queue
    jobs have returned.
    """
    return InProcessJobGate()


@pytest.fixture(name="client")
def client_fixture(db_session: Session, in_process_jobs: InProcessJobGate, monkeypatch):
    """FastAPI TestClient fixture.

    This overrides `get_session` with a test double. Jobs the requests queue
    in-process wait for ``in_process_jobs.run_queued_jobs()``.
    """

    def get_session_override():
        return db_session

    backend_app.dependency_overrides[get_session] = get_session_override

    @contextmanager
    def session_context_override():
        yield db_session

    from backend.api.v1 import compose as compose_module

    if hasattr(compose_module, "get_session_context"):
        monkeypatch.setattr(
            compose_module,
            "get_session_context",
            lambda: session_context_override(),
        )

    yield TestClient(fastapi_app)

    backend_app.dependency_overrides.clear()
