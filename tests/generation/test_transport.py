"""Tests focused on websocket and transport interactions for generation jobs."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from backend.schemas import SDNextGenerationParams
from backend.services.deliveries import DeliveryService
from backend.services.generation import GenerationCoordinator, GenerationService
from backend.services.websocket import WebSocketService


@pytest.mark.anyio
async def test_generation_coordinator_broadcast_job_started(monkeypatch: pytest.MonkeyPatch):
    """Coordinator triggers WebSocket monitoring and broadcasts."""
    deliveries = MagicMock(spec=DeliveryService)
    websocket = WebSocketService()
    coordinator = GenerationCoordinator(
        deliveries,
        websocket,
        GenerationService(),
    )

    start_mock = AsyncMock()
    broadcast_mock = AsyncMock()
    monkeypatch.setattr(websocket, "start_job_monitoring", start_mock)
    monkeypatch.setattr(websocket.manager, "broadcast_generation_started", broadcast_mock)

    params = SDNextGenerationParams(prompt="Prompt")

    await coordinator.broadcast_job_started("job-1", params)

    start_mock.assert_awaited_once()
    awaited_job_id, awaited_service = start_mock.await_args.args
    assert awaited_job_id == "job-1"
    assert isinstance(awaited_service, GenerationService)

    broadcast_mock.assert_awaited_once()
    broadcast_args = broadcast_mock.await_args.args
    assert broadcast_args[0] == "job-1"
    assert broadcast_args[1].job_id == "job-1"
    assert broadcast_args[1].params.prompt == "Prompt"
