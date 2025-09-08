"""
HTMX Router Module

Handles all HTMX API endpoints that return HTML partials
for dynamic content updates in the LoRA Manager frontend.
"""

import logging
from fastapi import APIRouter, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from pydantic import ValidationError

from app.frontend.config import get_settings
from app.frontend.utils.http import fetch_backend
from app.frontend.schemas import SimilarityForm, PromptForm

# Logger for HTMX routes
logger = logging.getLogger(__name__)

# Create router for HTMX routes
router = APIRouter(prefix="/api/htmx")

# Initialize templates with configuration
settings = get_settings()
templates = Jinja2Templates(directory=str(settings.get_template_path()))


# Dashboard HTMX endpoints
@router.get("/dashboard/featured-loras", response_class=HTMLResponse)
async def htmx_featured_loras(request: Request):
    """HTMX endpoint for loading featured LoRAs on dashboard."""
    try:
        status, featured_loras = await fetch_backend("/api/dashboard/featured-loras")
        if status != 200:
            featured_loras = []
    except Exception as e:
        logger.warning(f"Failed to load featured LoRAs: {e}")
        featured_loras = []
    
    return templates.TemplateResponse("partials/featured-loras.html", {
        "request": request,
        "featured_loras": featured_loras
    })


@router.get("/dashboard/activity-feed", response_class=HTMLResponse)
async def htmx_activity_feed(request: Request):
    """HTMX endpoint for loading activity feed on dashboard."""
    try:
        status, activities = await fetch_backend("/api/dashboard/activity-feed")
        if status != 200:
            activities = []
    except Exception as e:
        logger.warning(f"Failed to load activity feed: {e}")
        activities = []
    
    return templates.TemplateResponse("partials/activity-feed.html", {
        "request": request,
        "activities": activities
    })


@router.get("/dashboard/system-stats", response_class=HTMLResponse)
async def htmx_system_stats(request: Request):
    """HTMX endpoint for loading system statistics."""
    try:
        status, stats = await fetch_backend("/api/v1/admin/system/stats")
        if status != 200:
            stats = {}
    except Exception as e:
        logger.warning(f"Failed to load system stats: {e}")
        stats = {}
    
    return templates.TemplateResponse("partials/system-stats.html", {
        "request": request,
        "stats": stats
    })


# Recommendations HTMX endpoints
@router.post("/recommendations/similar", response_class=HTMLResponse)
async def htmx_similarity_recommendations(request: Request):
    """HTMX endpoint for similarity-based recommendations"""
    form = None
    try:
        data = await request.form()
        form = SimilarityForm(**{
            'lora_id': data.get('lora_id', ''),
            'semantic_weight': float(data.get('semantic_weight', 0.4)),
            'artistic_weight': float(data.get('artistic_weight', 0.3)),
            'technical_weight': float(data.get('technical_weight', 0.3)),
            'limit': int(data.get('limit', 10)),
            'threshold': float(data.get('threshold', 0.1)),
        })
    except ValidationError as ve:
        logger.warning("SimilarityForm validation failed", extra={"errors": ve.errors()})
        errors = {e['loc'][0]: e['msg'] for e in ve.errors()}
        return templates.TemplateResponse("partials/similarity-results-refactored.html", {
            "request": request,
            "recommendations": [],
            "error": "Validation failed",
            "validation_errors": errors
        })
    except Exception as e:
        return templates.TemplateResponse("partials/similarity-results-refactored.html", {
            "request": request,
            "recommendations": [],
            "error": f"Invalid input: {e}"
        })

    try:
        # Prepare parameters for backend API
        params = {
            'semantic_weight': form.semantic_weight,
            'artistic_weight': form.artistic_weight,
            'technical_weight': form.technical_weight,
            'limit': form.limit,
            'threshold': form.threshold
        }
        
        # Make request to backend API using centralized http client
        status, recommendations = await fetch_backend(
            f"/api/v1/recommendations/similar/{form.lora_id}",
            params=params
        )
        
        if status == 200:
            return templates.TemplateResponse("partials/similarity-results-refactored.html", {
                "request": request,
                "recommendations": recommendations,
                "original_lora_id": form.lora_id,
                "weights": {
                    "semantic": form.semantic_weight, 
                    "artistic": form.artistic_weight, 
                    "technical": form.technical_weight
                }
            })
        else:
            error_msg = f"Backend API error: {status}"
            return templates.TemplateResponse("partials/similarity-results-refactored.html", {
                "request": request,
                "recommendations": [],
                "error": error_msg
            })
    except Exception as e:
        logger.error(f"Error in similarity recommendations: {e}")
        return templates.TemplateResponse("partials/similarity-results-refactored.html", {
            "request": request,
            "recommendations": [], 
            "error": f"Error: {str(e)}"
        })


@router.post("/recommendations/prompt", response_class=HTMLResponse)
async def htmx_prompt_recommendations(request: Request):
    """HTMX endpoint for prompt-based recommendations"""
    form = None
    try:
        data = await request.form()
        form = PromptForm(**{
            'prompt': data.get('prompt', ''),
            'semantic_weight': float(data.get('semantic_weight', 0.4)),
            'style_weight': float(data.get('style_weight', 0.3)),
            'context_weight': float(data.get('context_weight', 0.3)),
            'limit': int(data.get('limit', 10)),
        })
    except ValidationError as ve:
        logger.warning("PromptForm validation failed", extra={"errors": ve.errors()})
        errors = {e['loc'][0]: e['msg'] for e in ve.errors()}
        return templates.TemplateResponse("partials/prompt-results-refactored.html", {
            "request": request,
            "recommendations": [],
            "error": "Validation failed",
            "validation_errors": errors
        })

    try:
        # Prepare payload for backend API
        payload = {
            'prompt': form.prompt.strip(),
            'weights': {
                'semantic': form.semantic_weight,
                'style': form.style_weight,
                'context': form.context_weight
            },
            'limit': form.limit
        }
        
        # Make request to backend API
        status, data = await fetch_backend(
            "/api/v1/recommendations/for-prompt",
            method='POST',
            json=payload
        )
        
        if status == 200:
            return templates.TemplateResponse("partials/prompt-results.html", {
                "request": request,
                "recommendations": data.get('recommendations', []),
                "original_prompt": form.prompt,
                "processing_time_ms": data.get('processing_time_ms', 0),
                "analysis_summary": data.get('analysis_summary', {})
            })
        else:
            error_msg = f"Backend error: {status}"
            return templates.TemplateResponse("partials/prompt-results.html", {
                "request": request,
                "recommendations": [], 
                "original_prompt": form.prompt,
                "error": error_msg
            })
            
    except Exception as e:
        logger.error(f"Error in prompt recommendations: {e}")
        original_prompt = getattr(form, 'prompt', '') if form else ''
        return templates.TemplateResponse("partials/prompt-results.html", {
            "request": request,
            "recommendations": [], 
            "original_prompt": original_prompt,
            "error": f"Error: {str(e)}"
        })


@router.get("/recommendations/embedding-status", response_class=HTMLResponse)
async def htmx_embedding_status(request: Request):
    """HTMX endpoint for embedding status"""
    try:
        status, embedding_status = await fetch_backend("/api/v1/recommendations/embedding-status")
        if status != 200:
            embedding_status = {"status": "unknown", "progress": 0}
    except Exception as e:
        logger.warning(f"Failed to load embedding status: {e}")
        embedding_status = {"status": "error", "progress": 0, "error": str(e)}
    
    return templates.TemplateResponse("partials/embedding-status.html", {
        "request": request,
        "embedding_status": embedding_status
    })


# LoRA Gallery HTMX endpoints
@router.get("/loras/gallery", response_class=HTMLResponse)
async def htmx_lora_gallery(request: Request):
    """HTMX endpoint for LoRA gallery grid"""
    try:
        # Get query parameters
        page = int(request.query_params.get('page', 1))
        limit = int(request.query_params.get('limit', 24))
        search = request.query_params.get('search', '')
        tags = request.query_params.get('tags', '')
        
        params = {
            'page': page,
            'limit': limit,
            'search': search,
            'tags': tags
        }
        
        status, loras_data = await fetch_backend("/api/v1/adapters", params=params)
        if status != 200:
            loras_data = {"loras": [], "total": 0, "page": 1}
    except Exception as e:
        logger.warning(f"Failed to load LoRA gallery: {e}")
        loras_data = {"loras": [], "total": 0, "page": 1}
    
    return templates.TemplateResponse("partials/lora-gallery.html", {
        "request": request,
        "loras": loras_data.get("loras", []),
        "total": loras_data.get("total", 0),
        "page": loras_data.get("page", 1),
        "has_more": len(loras_data.get("loras", [])) == int(request.query_params.get('limit', 24))
    })


@router.get("/loras/{lora_id}/details", response_class=HTMLResponse)
async def htmx_lora_details(request: Request, lora_id: str):
    """HTMX endpoint for LoRA details modal"""
    try:
        status, lora_details = await fetch_backend(f"/api/v1/adapters/{lora_id}")
        if status != 200:
            lora_details = None
    except Exception as e:
        logger.warning(f"Failed to load LoRA details: {e}")
        lora_details = None
    
    return templates.TemplateResponse("partials/lora-details.html", {
        "request": request,
        "lora": lora_details,
        "lora_id": lora_id
    })


# Generation HTMX endpoints
@router.get("/generation/history", response_class=HTMLResponse)
async def htmx_generation_history(request: Request):
    """HTMX endpoint for generation history"""
    try:
        page = int(request.query_params.get('page', 1))
        limit = int(request.query_params.get('limit', 20))
        
        params = {'page': page, 'limit': limit}
        
        status, history_data = await fetch_backend("/api/v1/generations", params=params)
        if status != 200:
            history_data = {"generations": [], "total": 0}
    except Exception as e:
        logger.warning(f"Failed to load generation history: {e}")
        history_data = {"generations": [], "total": 0}
    
    return templates.TemplateResponse("partials/generation-history.html", {
        "request": request,
        "generations": history_data.get("generations", []),
        "total": history_data.get("total", 0)
    })


@router.get("/generation/active-jobs", response_class=HTMLResponse)
async def htmx_active_jobs(request: Request):
    """HTMX endpoint for active generation jobs"""
    try:
        status, jobs = await fetch_backend("/api/v1/generations/active")
        if status != 200:
            jobs = []
    except Exception as e:
        logger.warning(f"Failed to load active jobs: {e}")
        jobs = []
    
    return templates.TemplateResponse("partials/active-jobs.html", {
        "request": request,
        "jobs": jobs
    })


# System Admin HTMX endpoints
@router.get("/admin/system-metrics", response_class=HTMLResponse)
async def htmx_system_metrics(request: Request):
    """HTMX endpoint for system metrics"""
    try:
        status, metrics = await fetch_backend("/api/v1/admin/system/metrics")
        if status != 200:
            metrics = {}
    except Exception as e:
        logger.warning(f"Failed to load system metrics: {e}")
        metrics = {}
    
    return templates.TemplateResponse("partials/system-metrics.html", {
        "request": request,
        "metrics": metrics
    })


@router.get("/admin/workers-status", response_class=HTMLResponse)
async def htmx_workers_status(request: Request):
    """HTMX endpoint for workers status"""
    try:
        status, workers = await fetch_backend("/api/v1/admin/workers")
        if status != 200:
            workers = []
    except Exception as e:
        logger.warning(f"Failed to load workers status: {e}")
        workers = []
    
    return templates.TemplateResponse("partials/workers-status.html", {
        "request": request,
        "workers": workers
    })


# Utility functions for error handling
def render_error_partial(request: Request, template: str, error_message: str):
    """Render an error partial with consistent error handling"""
    return templates.TemplateResponse(template, {
        "request": request,
        "error": error_message,
        "recommendations": [],
        "loras": [],
        "jobs": [],
        "workers": []
    })


def validate_form_data(form_class, data):
    """Validate form data and return form object or errors"""
    try:
        return form_class(**data), None
    except ValidationError as ve:
        errors = {e['loc'][0]: e['msg'] for e in ve.errors()}
        return None, errors
