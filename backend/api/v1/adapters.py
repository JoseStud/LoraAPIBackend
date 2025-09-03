"""HTTP routes for managing adapters."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from backend.core.database import get_session
from backend.core.dependencies import get_adapter_service
from backend.models import Adapter
from backend.schemas import AdapterCreate, AdapterListResponse, AdapterWrapper
from backend.services import AdapterService

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
    search: str = "",
    active_only: bool = False,
    tags: str = "",
    sort: str = "name",
    page: int = 1,
    per_page: int = 24,
    db_session: Session = Depends(get_session),  # noqa: B008
):
    """Return a paginated list of adapters.

    Supports search, filtering by active status, tags, and sorting.
    """
    q = select(Adapter)
    
    # Apply search filter
    if search:
        q = q.where(Adapter.name.ilike(f"%{search}%"))
    
    # Apply active filter
    if active_only:
        q = q.where(Adapter.active == True)
    
    # Apply tag filters (tags is comma-separated string)
    if tags:
        tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]
        if tag_list:
            # For now, we'll do a simple contains check
            # In a real implementation, you'd parse JSON tags properly
            for tag in tag_list:
                q = q.where(Adapter.tags.ilike(f"%{tag}%"))
    
    # Get total count before pagination
    total_count = len(db_session.exec(q).all())
    
    # Apply sorting
    if sort == "name":
        q = q.order_by(Adapter.name)
    elif sort == "created_at":
        q = q.order_by(Adapter.created_at.desc())
    elif sort == "updated_at":
        q = q.order_by(Adapter.updated_at.desc())
    elif sort == "file_size":
        q = q.order_by(Adapter.file_size.desc())
    else:
        q = q.order_by(Adapter.name)
    
    # Apply pagination
    offset = (page - 1) * per_page
    results = db_session.exec(q.offset(offset).limit(per_page)).all()
    
    # Calculate pagination info
    total_pages = (total_count + per_page - 1) // per_page
    filtered_count = total_count
    
    # Convert to response format
    items = [a.model_dump() for a in results]
    
    return {
        "items": items,
        "total": total_count,
        "filtered": filtered_count,
        "page": page,
        "pages": total_pages,
        "per_page": per_page,
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
