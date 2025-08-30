"""Common base schemas."""

from datetime import datetime
from typing import Any, Dict

from pydantic import BaseModel


class WebSocketMessage(BaseModel):
    """Base WebSocket message structure."""
    
    type: str
    timestamp: datetime
    data: Dict[str, Any]


class WebSocketSubscription(BaseModel):
    """WebSocket subscription request."""
    
    type: str = "subscribe"
    job_ids: list[str] | None = None  # If None, subscribe to all
    include_previews: bool = False
