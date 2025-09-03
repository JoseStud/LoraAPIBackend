"""Shared fixtures for the test suite."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

# Use new app import paths
from backend.core.database import get_session
from backend.main import app
from backend.services import ServiceContainer
from backend.services.adapters import AdapterService
from backend.services.composition import ComposeService
from backend.services.deliveries import DeliveryService


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
    
    # Patch the storage service factory in all possible locations
    import backend.services.storage
    # Since we moved to backend, we need to patch the backend app's services
    monkeypatch.setattr("backend.services.storage.get_storage_service", lambda: mock_storage_service)
    
    # Also patch the ServiceContainer's property method directly
    from backend.services import ServiceContainer
    original_storage_property = ServiceContainer.storage
    
    def mock_storage_property(self):
        return mock_storage_service
    
    monkeypatch.setattr(ServiceContainer, "storage", property(mock_storage_property))
    
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
    # Ensure tests enforce the same uniqueness we add via Alembic
    # Create a unique index on (name, version) for the adapter table so
    # test behavior matches production DB expectations.
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "CREATE UNIQUE INDEX IF NOT EXISTS ux_adapter_name_version ON adapter (name, version)",
        )
    with Session(engine) as session:
        yield session


@pytest.fixture
def adapter_service(db_session: Session, mock_storage) -> AdapterService:
    """AdapterService fixture using the new modular service."""
    # Use the mocked storage service
    container = ServiceContainer(db_session)
    return container.adapters


@pytest.fixture
def delivery_service(db_session: Session) -> DeliveryService:
    """DeliveryService fixture using the new modular service."""
    container = ServiceContainer(db_session)
    return container.deliveries


@pytest.fixture
def compose_service() -> ComposeService:
    """ComposeService fixture using the new modular service."""
    container = ServiceContainer(db_session=None)
    return container.compose


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
