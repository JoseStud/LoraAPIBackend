"""WebSocket manager service for real-time progress monitoring."""

import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Set

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from app.schemas import (
    GenerationComplete,
    GenerationStarted,
    ProgressUpdate,
    WebSocketMessage,
    WebSocketSubscription,
)

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
                result = await generation_service.check_progress(job_id)
                
                # Create progress update
                progress_update = ProgressUpdate(
                    job_id=job_id,
                    progress=result.progress or 0.0,
                    status=result.status,
                    error_message=result.error_message,
                )
                
                # Broadcast to subscribers
                await self.manager.broadcast_progress(job_id, progress_update)
                
                # Check if job is complete
                if result.status in ["completed", "failed"]:
                    complete_data = GenerationComplete(
                        job_id=job_id,
                        status=result.status,
                        images=result.images,
                        error_message=result.error_message,
                        generation_info=result.generation_info,
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

    def stop_job_monitoring(self, job_id: str):
        """Stop monitoring a job."""
        if job_id in self._progress_tasks:
            self._progress_tasks[job_id].cancel()
            del self._progress_tasks[job_id]
            logger.info("Stopped job monitoring", job_id=job_id)


# Global WebSocket service instance
websocket_service = WebSocketService()
