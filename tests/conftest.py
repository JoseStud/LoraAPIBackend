"""Shared fixtures for the test suite."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

import services
import storage
from db import get_session
from main import app
from services import AdapterService, ComposeService, DeliveryService


@pytest.fixture(name="mock_storage")
def mock_storage_fixture(monkeypatch) -> MagicMock:
    """Mock storage adapter fixture that patches `storage.file_exists`.

    Tests can set `mock_storage.exists.return_value` and the patch will cause
    `storage.file_exists` to call the mock.
    """
    mock = MagicMock()
    # Patch both the storage module and the services module reference so
    # AdapterService.validate_file_path (which imported file_exists at
    # module import time) will call the test mock.
    monkeypatch.setattr(storage, "file_exists", lambda path: mock.exists(path))
    monkeypatch.setattr(services, "file_exists", lambda path: mock.exists(path))
    return mock


@pytest.fixture(name="db_session")
def db_session_fixture():
    """Pytest fixture for an in-memory SQLite database session.

    Creates a new database for each test function and yields a session.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


@pytest.fixture
def adapter_service(db_session: Session) -> AdapterService:
    """AdapterService fixture."""
    return AdapterService(db_session)


@pytest.fixture
def delivery_service(db_session: Session) -> DeliveryService:
    """DeliveryService fixture."""
    return DeliveryService(db_session)


@pytest.fixture
def compose_service() -> ComposeService:
    """ComposeService fixture."""
    return ComposeService()


@pytest.fixture(name="client")
def client_fixture(db_session: Session):
    """FastAPI TestClient fixture.

    This overrides `get_session` with a test double.
    """

    def get_session_override():
        return db_session

    app.dependency_overrides[get_session] = get_session_override

    yield TestClient(app)

    app.dependency_overrides.clear()
