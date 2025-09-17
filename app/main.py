"""LoRA Manager - Main Application Entry Point

This file integrates both the backend API and frontend routes.
The backend is located in the backend/ directory.
The frontend templates and static files are in app/frontend/.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Import frontend routes
from app.frontend import routes_fastapi as frontend_routes

# Import backend application
from backend.main import app as backend_app

# Create the main application
app = FastAPI(
    title="LoRA Manager",
    description="LoRA Adapter Management System with AI-Powered Recommendations",
    version="1.0.0",
)

# Add CORS middleware using frontend settings
from app.frontend.config import get_settings as get_frontend_settings

_fe_settings = get_frontend_settings()
_cors = _fe_settings.get_cors_config()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors.get("allow_origins", ["http://localhost:5173", "http://localhost:8000"]),
    allow_credentials=_cors.get("allow_credentials", True),
    allow_methods=_cors.get("allow_methods", ["*"]),
    allow_headers=_cors.get("allow_headers", ["*"]),
)

# Mount static files for frontend
app.mount("/static", StaticFiles(directory="app/frontend/static"), name="static")

# Include frontend routes (serve HTML pages)
app.include_router(frontend_routes.router, tags=["frontend"])

# Include backend API routes
app.mount("/api", backend_app)

# Root endpoint redirect to dashboard
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "lora-manager"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
