"""
LoRA Manager - Main Application Entry Point

This file integrates both the backend API and frontend routes.
The backend is located in the backend/ directory.
The frontend templates and static files are in app/frontend/.
"""

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

# Import backend application
from backend.main import app as backend_app
from backend.core.config import settings

# Import frontend routes
from app.frontend import routes_fastapi as frontend_routes

# Create the main application
app = FastAPI(
    title="LoRA Manager",
    description="LoRA Adapter Management System with AI-Powered Recommendations",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
        reload=True
    )
