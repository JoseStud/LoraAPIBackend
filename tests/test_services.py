"""Tests for the service layer."""

from models import Adapter
from schemas import AdapterCreate


class TestAdapterService:
    """Tests for the AdapterService."""

    def test_validate_file_path_exists(self, adapter_service, mock_storage):
        """Test that validate_file_path returns True when the file exists."""
        mock_storage.exists.return_value = True
        assert adapter_service.validate_file_path("some/path") is True
        mock_storage.exists.assert_called_once_with("some/path")

    def test_validate_file_path_not_exists(self, adapter_service, mock_storage):
        """Test that validate_file_path returns False when the file does not exist."""
        mock_storage.exists.return_value = False
        assert adapter_service.validate_file_path("some/path") is False
        mock_storage.exists.assert_called_once_with("some/path")

    def test_save_adapter(self, adapter_service):
        """Test saving a new adapter."""
        payload = AdapterCreate(
            name="test-adapter",
            version="1.0",
            file_path="/fake/path",
            tags=["test"],
        )
        adapter = adapter_service.save_adapter(payload)
        assert adapter.id is not None
        assert adapter.name == "test-adapter"
        assert adapter.tags == '["test"]'

    def test_list_active_ordered(self, adapter_service, db_session):
        """Test listing active adapters in the correct order."""
        # Create some adapters
        a1 = Adapter(name="adapter1", weight=0.7, active=True, ordinal=1)
        a2 = Adapter(name="adapter2", weight=0.8, active=True, ordinal=2)
        a3 = Adapter(name="adapter3", weight=0.9, active=False, ordinal=3)
        db_session.add_all([a1, a2, a3])
        db_session.commit()

        active_adapters = adapter_service.list_active_ordered()
        assert len(active_adapters) == 2
        assert active_adapters[0].name == "adapter1"
        assert active_adapters[1].name == "adapter2"


class TestDeliveryService:
    """Tests for the DeliveryService."""

    def test_create_job(self, delivery_service):
        """Test creating a new delivery job."""
        job = delivery_service.create_job(
            prompt="test prompt", mode="http", params={"url": "http://test.com"},
        )
        assert job.id is not None
        assert job.prompt == "test prompt"
        assert job.status == "pending"


class TestComposeService:
    """Tests for the ComposeService."""

    def test_format_token(self, compose_service):
        """Test the formatting of a lora token."""
        token = compose_service.format_token("test-lora", 0.75)
        assert token == "<lora:test-lora:0.750>"
