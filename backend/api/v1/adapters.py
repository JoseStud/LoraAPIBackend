"""HTTP routes for managing adapters."""

from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlmodel import select

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
    if payload.version is None:
        st = st.where(Adapter.version.is_(None))
    else:
        st = st.where(Adapter.version == payload.version)
    if sess.exec(st).first():
        raise HTTPException(
            status_code=400,
            detail="adapter with this name and version already exists",
        )
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
    service: AdapterService = Depends(get_adapter_service),  # noqa: B008
):
    """Return a paginated list of adapters via the service layer."""

    tag_filters = [tag.strip() for tag in tags.split(",") if tag.strip()] if tags else []

    result = service.search_adapters(
        search=search,
        active_only=active_only,
        tags=tag_filters,
        sort=sort,
        page=page,
        per_page=per_page,
    )

    return {
        "items": [adapter.model_dump() for adapter in result.items],
        "total": result.total,
        "filtered": result.filtered,
        "page": result.page,
        "pages": result.pages,
        "per_page": result.per_page,
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
def get_adapter_tags(service: AdapterService = Depends(get_adapter_service)):
    """Return unique tag list across all adapters.

    Response shape matches frontend expectation: {"tags": [..]}.
    """
    try:
        tags = service.get_all_tags()
    except Exception as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=500, detail=f"Failed to load adapter tags: {exc}") from exc

    return {"tags": tags}


@router.post("/adapters/bulk")
def bulk_adapter_action(
    request: BulkActionRequest,
    service: AdapterService = Depends(get_adapter_service),  # noqa: B008
):
    """Perform a bulk action on a list of adapters in a transaction.

    Actions supported: activate, deactivate, delete.
    Returns summary counts and processed IDs.
    """
    if not request.lora_ids:
        return {"success": True, "processed": 0, "action": request.action, "ids": []}

    try:
        processed_ids = service.bulk_adapter_action(request.action, request.lora_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Bulk action failed: {exc}") from exc

    return {
        "success": True,
        "action": request.action,
        "processed": len(processed_ids),
        "ids": processed_ids,
    }


@router.patch("/adapters/{adapter_id}", response_model=AdapterWrapper)
def patch_adapter(
    adapter_id: str,
    payload: dict,
    service: AdapterService = Depends(get_adapter_service),  # noqa: B008
):
    """Update an adapter's fields.

    Supports updating tags (stored as JSON string) and other updatable fields.
    Only allows updating specific safe fields to prevent unauthorized modifications.
    """
    try:
        updated = service.patch_adapter(adapter_id, payload)
    except LookupError:
        raise HTTPException(status_code=404, detail="adapter not found")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # pragma: no cover - defensive guard
        raise HTTPException(status_code=500, detail=f"Failed to patch adapter: {exc}") from exc

    return {"adapter": updated.model_dump()}


@router.delete("/adapters/{adapter_id}", status_code=204)
def delete_adapter(
    adapter_id: str,
    service: AdapterService = Depends(get_adapter_service),  # noqa: B008
):
    """Delete an adapter by id.

    Returns 204 on success.
    """
    if not service.delete_adapter(adapter_id):
        raise HTTPException(status_code=404, detail="adapter not found")
    return


@router.get("/adapters/{adapter_id}", response_model=AdapterWrapper)
def get_adapter(
    adapter_id: str,
    service: AdapterService = Depends(get_adapter_service),  # noqa: B008
):
    """Return a single adapter by id.

    Raises HTTPException(404) if not found.
    """
    a = service.get_adapter(adapter_id)
    if not a:
        raise HTTPException(status_code=404, detail="adapter not found")
    ra = a.model_dump()
    return {"adapter": ra}


@router.post("/adapters/{adapter_id}/activate", response_model=AdapterWrapper)
def activate_adapter(
    adapter_id: str,
    ordinal: int = None,
    service: AdapterService = Depends(get_adapter_service),  # noqa: B008
):
    """Mark an adapter active and optionally set its ordinal."""
    a = service.activate_adapter(adapter_id, ordinal)
    if not a:
        raise HTTPException(status_code=404, detail="adapter not found")
    ra = a.model_dump()
    return {"adapter": ra}


@router.post("/adapters/{adapter_id}/deactivate", response_model=AdapterWrapper)
def deactivate_adapter(
    adapter_id: str,
    service: AdapterService = Depends(get_adapter_service),  # noqa: B008
):
    """Mark an adapter inactive."""
    a = service.deactivate_adapter(adapter_id)
    if not a:
        raise HTTPException(status_code=404, detail="adapter not found")
    ra = a.model_dump()
    return {"adapter": ra}
