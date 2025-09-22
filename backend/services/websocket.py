"""WebSocket manager service for real-time progress monitoring."""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from backend.core.database import get_session_context
from backend.schemas import (
    GenerationComplete,
    GenerationStarted,
    ProgressUpdate,
    WebSocketMessage,
    WebSocketSubscription,
)
from backend.services.deliveries import DeliveryService

logger = structlog.get_logger(__name__)


class ConnectionManager:
    """Manages WebSocket connections for real-time progress updates."""

    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.job_subscriptions: Dict[str, Set[str]] = {}  # job_id -> set of connection_ids
        self.connection_subscriptions: Dict[str, Set[str]] = {}  # connection_id -> set of job_ids
        self.global_subscribers: Set[str] = set()  # connections subscribed to all jobs
        self._connection_counter = 0

    async def connect(self, websocket: WebSocket) -> str:
        """Accept a new WebSocket connection and return connection ID."""
        await websocket.accept()
        
        self._connection_counter += 1
        connection_id = f"conn_{self._connection_counter}_{int(datetime.now().timestamp())}"
        
        self.active_connections[connection_id] = websocket
        self.connection_subscriptions[connection_id] = set()
        
        logger.info("WebSocket connected", connection_id=connection_id)
        
        # Send welcome message
        welcome_msg = WebSocketMessage(
            type="connected",
            timestamp=datetime.now(timezone.utc),
            data={"connection_id": connection_id, "message": "Connected to progress monitoring"},
        )
        await self._send_to_connection(connection_id, welcome_msg.model_dump())
        
        return connection_id

    def disconnect(self, connection_id: str):
        """Clean up a disconnected WebSocket connection."""
        if connection_id in self.active_connections:
            # Remove from global subscribers
            self.global_subscribers.discard(connection_id)
            
            # Remove from job subscriptions
            if connection_id in self.connection_subscriptions:
                for job_id in self.connection_subscriptions[connection_id]:
                    if job_id in self.job_subscriptions:
                        self.job_subscriptions[job_id].discard(connection_id)
                        if not self.job_subscriptions[job_id]:
                            del self.job_subscriptions[job_id]
                del self.connection_subscriptions[connection_id]
            
            # Remove connection
            del self.active_connections[connection_id]
            
            logger.info("WebSocket disconnected", connection_id=connection_id)

    async def handle_subscription(self, connection_id: str, subscription: WebSocketSubscription):
        """Handle subscription requests from clients."""
        if subscription.job_ids is None:
            # Subscribe to all jobs
            self.global_subscribers.add(connection_id)
            logger.info("Connection subscribed to all jobs", connection_id=connection_id)
        else:
            # Subscribe to specific jobs
            for job_id in subscription.job_ids:
                if job_id not in self.job_subscriptions:
                    self.job_subscriptions[job_id] = set()
                self.job_subscriptions[job_id].add(connection_id)
                self.connection_subscriptions[connection_id].add(job_id)
            
            logger.info(
                "Connection subscribed to jobs", 
                connection_id=connection_id, 
                job_ids=subscription.job_ids,
            )

    async def broadcast_progress(self, job_id: str, progress_data: ProgressUpdate):
        """Broadcast progress update to subscribed connections."""
        message = WebSocketMessage(
            type="progress_update",
            timestamp=datetime.now(timezone.utc),
            data=progress_data.model_dump(),
        )
        
        # Get connections interested in this job
        interested_connections = set()
        
        # Add global subscribers
        interested_connections.update(self.global_subscribers)
        
        # Add job-specific subscribers
        if job_id in self.job_subscriptions:
            interested_connections.update(self.job_subscriptions[job_id])
        
        # Send to all interested connections
        await self._broadcast_to_connections(interested_connections, message.model_dump())
        
        logger.debug(
            "Broadcasted progress update", 
            job_id=job_id, 
            progress=progress_data.progress,
            connections_count=len(interested_connections),
        )

    async def broadcast_generation_started(self, job_id: str, started_data: GenerationStarted):
        """Broadcast generation started notification."""
        message = WebSocketMessage(
            type="generation_started",
            timestamp=datetime.now(timezone.utc),
            data=started_data.model_dump(),
        )
        
        interested_connections = set()
        interested_connections.update(self.global_subscribers)
        if job_id in self.job_subscriptions:
            interested_connections.update(self.job_subscriptions[job_id])
        
        await self._broadcast_to_connections(interested_connections, message.model_dump())
        logger.info("Broadcasted generation started", job_id=job_id)

    async def broadcast_generation_complete(self, job_id: str, complete_data: GenerationComplete):
        """Broadcast generation complete notification."""
        message = WebSocketMessage(
            type="generation_complete",
            timestamp=datetime.now(timezone.utc),
            data=complete_data.model_dump(),
        )
        
        interested_connections = set()
        interested_connections.update(self.global_subscribers)
        if job_id in self.job_subscriptions:
            interested_connections.update(self.job_subscriptions[job_id])
        
        await self._broadcast_to_connections(interested_connections, message.model_dump())
        logger.info("Broadcasted generation complete", job_id=job_id, status=complete_data.status)

    async def _send_to_connection(self, connection_id: str, message: dict):
        """Send message to a specific connection."""
        if connection_id in self.active_connections:
            try:
                websocket = self.active_connections[connection_id]
                await websocket.send_text(json.dumps(message))
            except Exception as e:
                logger.warning(
                    "Failed to send WebSocket message", 
                    connection_id=connection_id, 
                    error=str(e),
                )
                # Connection might be broken, clean it up
                self.disconnect(connection_id)

    async def _broadcast_to_connections(self, connection_ids: Set[str], message: dict):
        """Broadcast message to multiple connections."""
        if not connection_ids:
            return
        
        # Send to all connections concurrently
        tasks = []
        for connection_id in connection_ids:
            if connection_id in self.active_connections:
                tasks.append(self._send_to_connection(connection_id, message))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)


class WebSocketService:
    """Service for managing WebSocket connections and progress broadcasting."""
    
    def __init__(self):
        self.manager = ConnectionManager()
        self._progress_tasks: Dict[str, asyncio.Task] = {}  # job_id -> polling task

    async def handle_connection(self, websocket: WebSocket):
        """Handle a new WebSocket connection."""
        connection_id = await self.manager.connect(websocket)
        
        try:
            while True:
                # Wait for client messages
                data = await websocket.receive_text()
                await self._handle_client_message(connection_id, data)
                
        except WebSocketDisconnect:
            self.manager.disconnect(connection_id)
        except Exception as e:
            logger.error("WebSocket error", connection_id=connection_id, error=str(e))
            self.manager.disconnect(connection_id)

    async def _handle_client_message(self, connection_id: str, data: str):
        """Handle incoming client messages (subscriptions, etc.)."""
        try:
            message = json.loads(data)
            
            if message.get("type") == "subscribe":
                subscription = WebSocketSubscription(**message)
                await self.manager.handle_subscription(connection_id, subscription)
                
                # Send confirmation
                response = WebSocketMessage(
                    type="subscription_confirmed",
                    timestamp=datetime.now(timezone.utc),
                    data={"job_ids": subscription.job_ids},
                )
                await self.manager._send_to_connection(connection_id, response.model_dump())
                
        except Exception as e:
            logger.warning("Failed to handle client message", connection_id=connection_id, error=str(e))

    async def start_job_monitoring(self, job_id: str, generation_service):
        """Start monitoring a generation job for progress updates."""
        if job_id in self._progress_tasks:
            # Already monitoring this job
            return

        task = asyncio.create_task(self._monitor_job_progress(job_id, generation_service))
        self._progress_tasks[job_id] = task

        logger.info("Started job monitoring", job_id=job_id)

    async def _monitor_job_progress(self, job_id: str, generation_service):
        """Monitor job progress and broadcast updates."""
        try:
            while True:
                # Check job status
                result = await self._call_generation_progress(generation_service, job_id)

                persisted_state = self._load_persisted_job_state(job_id)

                status_value = result.status or "pending"
                progress_value = self._normalize_progress(result.progress)
                error_message = result.error_message

                if persisted_state is not None:
                    result_payload = persisted_state.get("result")
                    stored_status = persisted_state.get("status")
                    if not stored_status and isinstance(result_payload, dict):
                        stored_status = result_payload.get("status")

                    mapped_status = self._map_delivery_status(stored_status)
                    if mapped_status is not None:
                        status_value = mapped_status

                    stored_progress = self._extract_progress_from_payload(result_payload)
                    if stored_progress is not None:
                        progress_value = stored_progress

                    if status_value == "completed" and (progress_value is None or progress_value < 1.0):
                        progress_value = 1.0

                    if error_message is None:
                        error_message = self._extract_error_message(result_payload)

                if progress_value is None:
                    progress_value = 0.0

                # Create progress update
                progress_update = ProgressUpdate(
                    job_id=job_id,
                    progress=progress_value,
                    status=status_value,
                    error_message=error_message,
                )

                # Broadcast to subscribers
                await self.manager.broadcast_progress(job_id, progress_update)

                # Check if job is complete
                if self._has_job_completed(status_value, persisted_state):
                    complete_data = self._build_completion_payload(
                        job_id,
                        status_value,
                        result,
                        persisted_state,
                        error_message,
                    )
                    await self.manager.broadcast_generation_complete(job_id, complete_data)
                    break

                # Wait before next poll
                await asyncio.sleep(2)  # Poll every 2 seconds

        except asyncio.CancelledError:
            logger.info("Job monitoring cancelled", job_id=job_id)
        except Exception as e:
            logger.error("Job monitoring error", job_id=job_id, error=str(e))
        finally:
            # Clean up
            if job_id in self._progress_tasks:
                del self._progress_tasks[job_id]

    async def _call_generation_progress(self, generation_service, job_id: str):
        """Invoke the appropriate progress check on the generation service."""

        if hasattr(generation_service, "check_progress"):
            return await generation_service.check_progress(job_id)

        if hasattr(generation_service, "check_generation_progress"):
            return await generation_service.check_generation_progress(job_id)

        raise AttributeError(
            "Generation service does not expose a progress check method",
        )

    def _load_persisted_job_state(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Load stored job status and result payload from the database."""

        try:
            with get_session_context() as session:
                service = DeliveryService(session)
                job = service.get_job(job_id)
                if job is None:
                    return None

                result_payload = service.get_job_result(job)
                payload = result_payload if isinstance(result_payload, dict) else None

                return {
                    "status": job.status,
                    "result": payload,
                    "started_at": job.started_at,
                    "finished_at": job.finished_at,
                }
        except Exception as exc:  # pragma: no cover - defensive logging
            logger.warning(
                "Failed to load persisted job state",
                job_id=job_id,
                error=str(exc),
            )
            return None

    @staticmethod
    def _map_delivery_status(status: Optional[str]) -> Optional[str]:
        """Map delivery job statuses onto WebSocket progress statuses."""

        if not status:
            return None

        normalized = status.lower()
        if normalized == "succeeded":
            return "completed"
        if normalized in {"failed", "cancelled"}:
            return "failed"
        if normalized == "completed":
            return "completed"
        return normalized

    def _extract_progress_from_payload(self, payload: Optional[Dict[str, Any]]) -> Optional[float]:
        """Extract and normalize progress from a stored result payload."""

        if not isinstance(payload, dict):
            return None

        return self._normalize_progress(payload.get("progress"))

    @staticmethod
    def _extract_error_message(payload: Optional[Dict[str, Any]]) -> Optional[str]:
        """Extract the most relevant error message from a stored payload."""

        if not isinstance(payload, dict):
            return None

        for key in ("error_message", "error", "detail", "message"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                return value
        return None

    @staticmethod
    def _normalize_progress(progress: Optional[Any]) -> Optional[float]:
        """Normalize progress values to the 0.0-1.0 range."""

        if progress is None:
            return None

        try:
            value = float(progress)
        except (TypeError, ValueError):
            return None

        if value > 1.0:
            value = value / 100.0
        if value < 0.0:
            value = 0.0
        return min(value, 1.0)

    def _has_job_completed(
        self,
        status: str,
        persisted_state: Optional[Dict[str, Any]],
    ) -> bool:
        """Determine if the job should be treated as finished."""

        if status in {"completed", "failed"}:
            return True

        if not persisted_state:
            return False

        stored_status = persisted_state.get("status")
        payload = persisted_state.get("result")
        if not stored_status and isinstance(payload, dict):
            stored_status = payload.get("status")

        if not stored_status:
            return False

        return stored_status.lower() in {"succeeded", "failed", "cancelled"}

    def _build_completion_payload(
        self,
        job_id: str,
        status: str,
        progress_result,
        persisted_state: Optional[Dict[str, Any]],
        error_message: Optional[str],
    ) -> GenerationComplete:
        """Create the completion payload combining live and persisted data."""

        images = progress_result.images
        generation_info = progress_result.generation_info
        payload: Optional[Dict[str, Any]] = None

        if persisted_state is not None:
            payload = persisted_state.get("result")

        if (not images) and isinstance(payload, dict):
            stored_images = payload.get("images")
            if isinstance(stored_images, list) and stored_images:
                images = stored_images

        if generation_info is None and isinstance(payload, dict):
            stored_info = payload.get("generation_info")
            if isinstance(stored_info, dict) and stored_info:
                generation_info = stored_info

        final_error = error_message or progress_result.error_message
        if final_error is None and isinstance(payload, dict):
            final_error = self._extract_error_message(payload)

        total_duration: Optional[float] = None
        if persisted_state is not None:
            total_duration = self._calculate_total_duration(
                persisted_state.get("started_at"),
                persisted_state.get("finished_at"),
            )

        if images is not None and not images:
            images = None

        return GenerationComplete(
            job_id=job_id,
            status=status,
            images=images,
            error_message=final_error,
            total_duration=total_duration,
            generation_info=generation_info,
        )

    @staticmethod
    def _calculate_total_duration(
        started_at: Optional[datetime],
        finished_at: Optional[datetime],
    ) -> Optional[float]:
        """Calculate the job duration in seconds if timestamps are available."""

        if started_at is None or finished_at is None:
            return None

        try:
            return float((finished_at - started_at).total_seconds())
        except Exception:  # pragma: no cover - defensive branch
            return None

    def stop_job_monitoring(self, job_id: str):
        """Stop monitoring a job."""
        if job_id in self._progress_tasks:
            self._progress_tasks[job_id].cancel()
            del self._progress_tasks[job_id]
            logger.info("Stopped job monitoring", job_id=job_id)


# Global WebSocket service instance
websocket_service = WebSocketService()
