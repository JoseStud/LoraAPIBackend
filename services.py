"""Service layer for the application."""

import json
import os
import tempfile
from typing import List

import requests
from sqlmodel import Session, select

from db import get_session
from models import Adapter, DeliveryJob
from schemas import AdapterCreate
from storage import file_exists


class AdapterService:
    """Service for adapter-related operations."""

    def __init__(self, db_session: Session):
        """Initialize AdapterService with a DB session."""
        self.db_session = db_session

    def validate_file_path(self, path: str) -> bool:
        """Return True if the given path exists and is readable."""
        return file_exists(path)

    def save_adapter(self, payload: AdapterCreate) -> Adapter:
        """Create and persist an Adapter from a creation payload."""
        adapter = Adapter(
            name=payload.name,
            version=payload.version,
            tags=payload.tags or [],
            file_path=payload.file_path,
            weight=payload.weight or 1.0,
            active=payload.active or False,
            ordinal=payload.ordinal,
        )
        self.db_session.add(adapter)
        self.db_session.commit()
        self.db_session.refresh(adapter)
        return adapter

    def list_active_ordered(self) -> List[Adapter]:
        """Return active adapters ordered and deduplicated."""
        q = select(Adapter).where(Adapter.active)
        adapters = self.db_session.exec(q).all()
        adapters.sort(key=lambda a: (a.ordinal if a.ordinal is not None else 0, a.name))
        # Deduplicate by name, keeping the one with the highest weight.
        seen = {}
        for a in adapters:
            if a.name not in seen or a.weight > seen[a.name].weight:
                seen[a.name] = a
        return list(seen.values())


class DeliveryService:
    """Service for delivery job operations."""

    def __init__(self, db_session: Session):
        """Initialize DeliveryService with a DB session."""
        self.db_session = db_session

    def create_job(self, prompt: str, mode: str, params: dict) -> DeliveryJob:
        """Create and persist a DeliveryJob record."""
        dj = DeliveryJob(prompt=prompt, mode=mode, params=json.dumps(params or {}))
        self.db_session.add(dj)
        self.db_session.commit()
        self.db_session.refresh(dj)
        return dj


class ComposeService:
    """Service for prompt composition."""

    def format_token(self, name: str, weight: float) -> str:
        """Format a lora token string for composition."""
        return f"<lora:{name}:{weight:.3f}>"


# These delivery functions are not part of a service class as they represent
# the final step of a background task and don't have dependencies.
def deliver_http(prompt: str, params) -> dict:
    """Deliver the prompt to an HTTP endpoint described in `params`."""
    host = params.host
    port = params.port or 80
    path = params.path or "/"
    url = f"http://{host}:{port}{path}"
    try:
        r = requests.post(url, json={"prompt": prompt}, timeout=5)
        return {"status": r.status_code, "detail": r.text}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


def deliver_cli(prompt: str, params) -> dict:
    """Write prompt to a temporary file and return its path."""
    fd, path = tempfile.mkstemp(prefix="lora_prompt_", text=True)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(prompt)
        return {"status": "ok", "detail": f"prompt written to {path}"}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


# Module-level helpers used by routers (thin wrappers around service classes).
def list_active_adapters_ordered() -> List[Adapter]:  # noqa: D103
    with get_session() as sess:
        svc = AdapterService(sess)
        return svc.list_active_ordered()


def format_token(name: str, weight: float) -> str:  # noqa: D103
    svc = ComposeService()
    return svc.format_token(name, weight)


def create_delivery_job(prompt: str, mode: str, params: dict) -> DeliveryJob:  # noqa: D103
    with get_session() as sess:
        svc = DeliveryService(sess)
        return svc.create_job(prompt, mode, params)
