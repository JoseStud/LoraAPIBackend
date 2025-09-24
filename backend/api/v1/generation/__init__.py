"""Generation API package."""

from fastapi import APIRouter

from . import exports, jobs, live, results

router = APIRouter(prefix="/generation", tags=["generation"])
router.include_router(live.router)
router.include_router(jobs.router)
router.include_router(results.router)
router.include_router(exports.router)

__all__ = ["router"]
