"""
Main Routes Module

Combines all route modules (pages, htmx, sw) into a single router
for the LoRA Manager frontend application.
"""

from fastapi import APIRouter
from app.frontend.routes import pages, htmx, sw

# Create main router
router = APIRouter()

# Include all sub-routers
router.include_router(pages.router, tags=["pages"])
router.include_router(htmx.router, tags=["htmx"])
router.include_router(sw.router, tags=["sw", "pwa"])

# Add any additional global routes here if needed
