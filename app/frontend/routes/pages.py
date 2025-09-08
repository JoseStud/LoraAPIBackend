"""
Pages Router Module

Handles all page routes that return TemplateResponse (HTML pages)
for the LoRA Manager frontend application.
"""

from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from app.frontend.config import get_settings

# Create router for page routes
router = APIRouter()

# Initialize templates with configuration
settings = get_settings()
templates = Jinja2Templates(directory=str(settings.get_template_path()))


@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Main dashboard page"""
    context = {
        "request": request,
        "title": "LoRA Manager Dashboard",
        "page": "dashboard",
        "enable_pwa": settings.enable_pwa,
        "enable_websockets": settings.enable_websockets
    }
    return templates.TemplateResponse("pages/dashboard.html", context)


@router.get("/loras", response_class=HTMLResponse)
async def loras(request: Request):
    """LoRA management page"""
    context = {
        "request": request,
        "title": "LoRA Collection",
        "page": "loras"
    }
    return templates.TemplateResponse("pages/loras.html", context)


@router.get("/recommendations", response_class=HTMLResponse)
async def recommendations(request: Request):
    """AI Recommendations page"""
    context = {
        "request": request,
        "title": "AI Recommendations",
        "page": "recommendations"
    }
    return templates.TemplateResponse("pages/recommendations.html", context)


@router.get("/compose", response_class=HTMLResponse)
async def compose(request: Request):
    """Prompt Composer page"""
    context = {
        "request": request,
        "title": "Prompt Composer",
        "page": "compose"
    }
    return templates.TemplateResponse("pages/compose.html", context)


@router.get("/generation-studio", response_class=HTMLResponse)
async def generation_studio(request: Request):
    """Generation Studio page"""
    context = {
        "request": request,
        "title": "Generation Studio",
        "page": "generation-studio"
    }
    return templates.TemplateResponse("pages/generation-studio.html", context)


@router.get("/generation-history", response_class=HTMLResponse)
async def generation_history(request: Request):
    """Generation History page"""
    context = {
        "request": request,
        "title": "Generation History",
        "page": "generation-history"
    }
    return templates.TemplateResponse("pages/generation-history.html", context)


@router.get("/import-export", response_class=HTMLResponse)
async def import_export(request: Request):
    """Import/Export Management page"""
    context = {
        "request": request,
        "title": "Import/Export",
        "page": "import-export"
    }
    return templates.TemplateResponse("pages/import-export.html", context)


@router.get("/system-admin", response_class=HTMLResponse)
async def system_admin(request: Request):
    """System Administration page"""
    context = {
        "request": request,
        "title": "System Administration",
        "page": "system-admin"
    }
    return templates.TemplateResponse("pages/system-admin.html", context)


@router.get("/analytics", response_class=HTMLResponse)
async def analytics(request: Request):
    """Performance Analytics page"""
    context = {
        "request": request,
        "title": "Performance Analytics",
        "page": "analytics",
        "enable_analytics": settings.enable_analytics
    }
    return templates.TemplateResponse("pages/analytics.html", context)


@router.get("/offline", response_class=HTMLResponse)
async def offline_page(request: Request):
    """Offline page for PWA"""
    context = {
        "request": request,
        "title": "Offline",
        "page": "offline",
        "enable_pwa": settings.enable_pwa
    }
    return templates.TemplateResponse("pages/offline.html", context)


@router.get("/settings", response_class=HTMLResponse)
async def settings_page(request: Request):
    """Application Settings page"""
    context = {
        "request": request,
        "title": "Settings",
        "page": "settings"
    }
    return templates.TemplateResponse("pages/settings.html", context)


@router.get("/help", response_class=HTMLResponse)
async def help_page(request: Request):
    """Help and Documentation page"""
    context = {
        "request": request,
        "title": "Help & Documentation",
        "page": "help"
    }
    return templates.TemplateResponse("pages/help.html", context)


@router.get("/api-docs", response_class=HTMLResponse)
async def api_docs(request: Request):
    """API Documentation page"""
    context = {
        "request": request,
        "title": "API Documentation",
        "page": "api-docs",
        "backend_url": settings.backend_url
    }
    return templates.TemplateResponse("pages/api-docs.html", context)


# Error pages
@router.get("/error/{error_code}", response_class=HTMLResponse)
async def error_page(request: Request, error_code: int):
    """Generic error page"""
    error_messages = {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Page Not Found",
        500: "Internal Server Error",
        502: "Bad Gateway",
        503: "Service Unavailable"
    }
    
    context = {
        "request": request,
        "title": f"Error {error_code}",
        "page": "error",
        "error_code": error_code,
        "error_message": error_messages.get(error_code, "Unknown Error")
    }
    return templates.TemplateResponse("pages/error.html", context)


# Utility function to add common context to all pages
def get_base_context(request: Request, title: str, page: str) -> dict:
    """Get base context for all pages"""
    return {
        "request": request,
        "title": title,
        "page": page,
        "settings": {
            "enable_pwa": settings.enable_pwa,
            "enable_websockets": settings.enable_websockets,
            "enable_analytics": settings.enable_analytics,
            "backend_url": settings.backend_url,
            "debug_mode": settings.debug_mode
        }
    }
