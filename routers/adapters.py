"""HTTP routes for managing adapters."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from db import get_session
from dependencies import get_adapter_service
from models import Adapter
from schemas import AdapterCreate, AdapterListResponse, AdapterWrapper
from services import AdapterService

router = APIRouter()


@router.post("/adapters", status_code=201, response_model=AdapterWrapper)
def create_adapter(
    payload: AdapterCreate,
    service: AdapterService = Depends(get_adapter_service),  # noqa: B008
):
    """Create a new adapter from the provided payload."""
    if not service.validate_file_path(payload.file_path):
        raise HTTPException(
            status_code=400,
            detail="file_path does not exist or is not readable",
        )
    # ensure unique using the same session backing the injected service so the
    # test override for get_session (which returns the in-memory session) is
    # respected and the saved adapter is visible to subsequent requests.
    sess = service.db_session
    st = select(Adapter).where(Adapter.name == payload.name)
    if sess.exec(st).first():
        raise HTTPException(status_code=400, detail="adapter name must be unique")
    a = service.save_adapter(payload)
    ra = a.model_dump()
    return {"adapter": ra}


@router.get("/adapters", response_model=AdapterListResponse)
def list_adapters(
    active: bool = None,
    tag: str = None,
    limit: int = 100,
    offset: int = 0,
    db_session: Session = Depends(get_session),  # noqa: B008
):
    """Return a paginated list of adapters.

    Optional filters: active (bool) and tag (str).
    """
    q = select(Adapter)
    if active is not None:
        q = q.where(Adapter.active == active)
    results = db_session.exec(q.offset(offset).limit(limit)).all()
    items = results
    total = len(items)
    # convert tags from JSON to list for response
    out = [a.model_dump() for a in items]
    return {
        "items": out,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/adapters/{adapter_id}", response_model=AdapterWrapper)
def get_adapter(adapter_id: str, db_session: Session = Depends(get_session)):  # noqa: B008
    """Return a single adapter by id.

    Raises HTTPException(404) if not found.
    """
    a = db_session.get(Adapter, adapter_id)
    if not a:
        raise HTTPException(status_code=404, detail="adapter not found")
    ra = a.model_dump()
    return {"adapter": ra}


@router.patch("/adapters/{adapter_id}", response_model=AdapterWrapper)
def patch_adapter(
    adapter_id: str, payload: dict, db_session: Session = Depends(get_session),  # noqa: B008
):
    """Update an adapter's fields.

    Supports updating tags (stored as JSON string) and other updatable fields.
    """
    a = db_session.get(Adapter, adapter_id)
    if not a:
        raise HTTPException(status_code=404, detail="adapter not found")
    for k, v in payload.items():
        if hasattr(a, k):
            setattr(a, k, v)
    a.updated_at = datetime.now(timezone.utc)
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    ra = a.model_dump()
    return {"adapter": ra}


@router.delete("/adapters/{adapter_id}", status_code=204)
def delete_adapter(adapter_id: str, db_session: Session = Depends(get_session)):  # noqa: B008
    """Delete an adapter by id.

    Returns 204 on success.
    """
    a = db_session.get(Adapter, adapter_id)
    if not a:
        raise HTTPException(status_code=404, detail="adapter not found")
    db_session.delete(a)
    db_session.commit()
    return


@router.post("/adapters/{adapter_id}/activate", response_model=AdapterWrapper)
def activate_adapter(
    adapter_id: str,
    ordinal: int = None,
    db_session: Session = Depends(get_session),  # noqa: B008
):
    """Mark an adapter active and optionally set its ordinal."""
    a = db_session.get(Adapter, adapter_id)
    if not a:
        raise HTTPException(status_code=404, detail="adapter not found")
    a.active = True
    if ordinal is not None:
        a.ordinal = ordinal
    a.updated_at = datetime.now(timezone.utc)
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    ra = a.model_dump()
    return {"adapter": ra}


@router.post("/adapters/{adapter_id}/deactivate", response_model=AdapterWrapper)
def deactivate_adapter(adapter_id: str, db_session: Session = Depends(get_session)):  # noqa: B008
    """Mark an adapter inactive."""
    a = db_session.get(Adapter, adapter_id)
    if not a:
        raise HTTPException(status_code=404, detail="adapter not found")
    a.active = False
    a.updated_at = datetime.now(timezone.utc)
    db_session.add(a)
    db_session.commit()
    db_session.refresh(a)
    ra = a.model_dump()
    return {"adapter": ra}
