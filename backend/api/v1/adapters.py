"""HTTP routes for managing adapters."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from typing import List, Literal, Optional
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
    tag_list = []
    if tags:
        tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]
    
    # Execute initial query without tag filtering (done in Python)
    all_results = db_session.exec(q).all()
    
    # Apply tag filtering in Python for cross-database compatibility
    if tag_list:
        def has_matching_tags(adapter):
            if not adapter.tags:
                return False
            adapter_tags = adapter.tags if isinstance(adapter.tags, list) else []
            # Convert to lowercase for case-insensitive matching
            adapter_tags_lower = [tag.lower() for tag in adapter_tags if isinstance(tag, str)]
            return any(filter_tag.lower() in adapter_tags_lower for filter_tag in tag_list)
        
        all_results = [adapter for adapter in all_results if has_matching_tags(adapter)]
    
    # Get total count after filtering
    total_count = len(all_results)
    
    # Apply sorting
    if sort == "name":
        all_results.sort(key=lambda x: x.name.lower() if x.name else "")
    elif sort == "created_at":
        all_results.sort(key=lambda x: x.created_at, reverse=True)
    elif sort == "updated_at":
        all_results.sort(key=lambda x: x.updated_at, reverse=True)
    elif sort == "file_size":
        all_results.sort(key=lambda x: x.primary_file_size_kb or 0, reverse=True)
    else:
        all_results.sort(key=lambda x: x.name.lower() if x.name else "")
    
    # Apply pagination
    offset = (page - 1) * per_page
    results = all_results[offset:offset + per_page]
    
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


# --------------------------- Auxiliary Endpoints ---------------------------

class BulkActionRequest(BaseModel):
    """Request body for bulk adapter actions."""

    action: Literal["activate", "deactivate", "delete"]
    lora_ids: List[str]

    @field_validator("lora_ids")
    @classmethod
    def _validate_ids(cls, v: List[str]):
        return [str(i) for i in v if str(i).strip()]


@router.get("/adapters/tags")
def get_adapter_tags(db_session: Session = Depends(get_session)):
    """Return unique tag list across all adapters.

    Response shape matches frontend expectation: {"tags": [..]}.
    """
    rows = db_session.exec(select(Adapter.tags)).all()
    unique = set()
    for tags in rows:
        if not tags:
            continue
        try:
            for t in tags:
                if isinstance(t, str) and t.strip():
                    unique.add(t.strip())
        except TypeError:
            # tags column might contain a single string by mistake
            if isinstance(tags, str) and tags.strip():
                unique.add(tags.strip())

    return {"tags": sorted(unique, key=lambda s: s.lower())}


@router.post("/adapters/bulk")
def bulk_adapter_action(
    request: BulkActionRequest,
    db_session: Session = Depends(get_session),  # noqa: B008
):
    """Perform a bulk action on a list of adapters in a transaction.

    Actions supported: activate, deactivate, delete.
    Returns summary counts and processed IDs.
    """
    if not request.lora_ids:
        return {"success": True, "processed": 0, "action": request.action, "ids": []}

    # Fetch targeted adapters
    adapters = db_session.exec(
        select(Adapter).where(Adapter.id.in_(request.lora_ids))
    ).all()

    processed_ids: List[str] = []
    now = datetime.now(timezone.utc)

    try:
        if request.action in ("activate", "deactivate"):
            new_state = request.action == "activate"
            for a in adapters:
                a.active = new_state
                a.updated_at = now
                db_session.add(a)
                processed_ids.append(a.id)
        elif request.action == "delete":
            for a in adapters:
                processed_ids.append(a.id)
                db_session.delete(a)
        # Commit changes atomically
        db_session.commit()
    except Exception as exc:
        # Ensure rollback and surface problem in a consistent error
        db_session.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk action failed: {exc}")

    return {
        "success": True,
        "action": request.action,
        "processed": len(processed_ids),
        "ids": processed_ids,
    }


@router.patch("/adapters/{adapter_id}", response_model=AdapterWrapper)
def patch_adapter(
    adapter_id: str, payload: dict, db_session: Session = Depends(get_session),  # noqa: B008
):
    """Update an adapter's fields.

    Supports updating tags (stored as JSON string) and other updatable fields.
    Only allows updating specific safe fields to prevent unauthorized modifications.
    """
    # Define allowlist of patchable fields
    ALLOWED_FIELDS = {
        "weight", "active", "ordinal", "tags", "description", "activation_text",
        "trained_words", "triggers", "archetype", "archetype_confidence",
        "visibility", "nsfw_level", "supports_generation", "sd_version"
    }
    
    a = db_session.get(Adapter, adapter_id)
    if not a:
        raise HTTPException(status_code=404, detail="adapter not found")
    
    # Validate and apply only allowed fields
    updated_fields = []
    for k, v in payload.items():
        if k not in ALLOWED_FIELDS:
            raise HTTPException(
                status_code=400, 
                detail=f"Field '{k}' is not allowed to be modified. Allowed fields: {', '.join(sorted(ALLOWED_FIELDS))}"
            )
        if hasattr(a, k):
            # Type validation for specific fields
            if k == "weight" and not isinstance(v, (int, float)):
                raise HTTPException(status_code=400, detail="Field 'weight' must be a number")
            if k == "active" and not isinstance(v, bool):
                raise HTTPException(status_code=400, detail="Field 'active' must be a boolean")
            if k == "ordinal" and v is not None and not isinstance(v, int):
                raise HTTPException(status_code=400, detail="Field 'ordinal' must be an integer or null")
            if k == "tags" and not isinstance(v, list):
                raise HTTPException(status_code=400, detail="Field 'tags' must be a list")
            if k == "nsfw_level" and not isinstance(v, int):
                raise HTTPException(status_code=400, detail="Field 'nsfw_level' must be an integer")
            
            setattr(a, k, v)
            updated_fields.append(k)
    
    if not updated_fields:
        raise HTTPException(status_code=400, detail="No valid fields provided for update")
    
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
