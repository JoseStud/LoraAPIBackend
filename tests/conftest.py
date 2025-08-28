"""Shared fixtures for the test suite."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from db import get_session
from main import app
from services import AdapterService, ComposeService, DeliveryService
from storage import Storage, get_storage


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


@pytest.fixture(name="mock_storage")
def mock_storage_fixture() -> MagicMock:
    """Mock storage adapter fixture."""
    mock = MagicMock(spec=Storage)
    return mock


@pytest.fixture
def adapter_service(db_session: Session, mock_storage: MagicMock) -> AdapterService:
    """AdapterService fixture."""
    return AdapterService(db_session, mock_storage)


@pytest.fixture
def delivery_service(db_session: Session) -> DeliveryService:
    """DeliveryService fixture."""
    return DeliveryService(db_session)


@pytest.fixture
def compose_service() -> ComposeService:
    """ComposeService fixture."""
    return ComposeService()


@pytest.fixture(name="client")
def client_fixture(db_session: Session, mock_storage: MagicMock):
    """FastAPI TestClient fixture.

    This overrides `get_session` and `get_storage` with test doubles.
    """

    def get_session_override():
        return db_session

    def get_storage_override():
        return mock_storage

    app.dependency_overrides[get_session] = get_session_override
    app.dependency_overrides[get_storage] = get_storage_override

    yield TestClient(app)

    app.dependency_overrides.clear()
