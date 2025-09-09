from fastapi import APIRouter, Request, Form, HTTPException
import logging
from pydantic import ValidationError
from app.frontend.schemas import SimilarityForm, PromptForm
from app.frontend.utils import vite_asset, vite_asset_css, is_development

# Logger for frontend routes
logger = logging.getLogger(__name__)
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
import httpx
import asyncio
from typing import Optional
import os

# Create router for frontend routes
router = APIRouter()

# Initialize templates
from app.frontend.config import FrontendSettings

# Initialize frontend configuration
frontend_settings = FrontendSettings()

templates = Jinja2Templates(directory="app/frontend/templates")

# Register Vite asset helpers with Jinja2
templates.env.globals['vite_asset'] = vite_asset
templates.env.globals['vite_asset_css'] = vite_asset_css
templates.env.globals['is_development'] = is_development

# Expose backend URL to client-side templates so frontend JS can call backend directly
templates.env.globals['BACKEND_URL'] = frontend_settings.backend_url

@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Main dashboard page"""
    return templates.TemplateResponse("pages/dashboard.html", {
        "request": request,
        "title": "LoRA Manager Dashboard"
    })

@router.get("/loras", response_class=HTMLResponse)
async def loras(request: Request):
    """LoRA management page"""
    return templates.TemplateResponse("pages/loras.html", {
        "request": request,
        "title": "LoRA Collection"
    })

@router.get("/recommendations", response_class=HTMLResponse)
async def recommendations(request: Request):
    """AI Recommendations page"""
    return templates.TemplateResponse("pages/recommendations.html", {
        "request": request,
        "title": "AI Recommendations"
    })

@router.get("/compose", response_class=HTMLResponse)
async def compose(request: Request):
    """Prompt Composer page"""
    return templates.TemplateResponse("pages/compose.html", {
        "request": request,
        "title": "Prompt Composer"
    })

@router.get("/generate", response_class=HTMLResponse)
async def generate(request: Request):
    """Generation Studio page"""
    return templates.TemplateResponse("pages/generate.html", {
        "request": request,
        "title": "Generation Studio"
    })

@router.get("/history", response_class=HTMLResponse)
async def history(request: Request):
    """Generation History page"""
    return templates.TemplateResponse("pages/history.html", {
        "request": request,
        "title": "Generation History"
    })

@router.get("/admin", response_class=HTMLResponse)
async def admin(request: Request):
    """System Administration page"""
    return templates.TemplateResponse("pages/admin.html", {
        "request": request,
        "title": "System Administration"
    })

@router.get("/analytics")
async def analytics_page(request: Request):
    """Performance analytics dashboard"""
    context = {
        "request": request,
        "title": "Performance Analytics",
        "page": "analytics"
    }
    return templates.TemplateResponse("pages/analytics.html", context)

@router.get("/import-export")
async def import_export_page(request: Request):
    """Import/Export data management"""
    context = {
        "request": request,
        "title": "Import/Export",
        "page": "import-export"
    }
    return templates.TemplateResponse("pages/import-export.html", context)

@router.get("/offline")
async def offline_page(request: Request):
    """Offline page for PWA"""
    context = {
        "request": request,
        "title": "Offline",
        "page": "offline"
    }
    return templates.TemplateResponse("pages/offline.html", context)


@router.get("/api/htmx/dashboard/featured-loras", response_class=HTMLResponse)
async def htmx_featured_loras(request: Request):
    """HTMX endpoint for loading featured LoRAs on dashboard."""
    import json
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{frontend_settings.backend_url}/dashboard/featured-loras", timeout=5.0)
            if response.status_code == 200:
                featured_loras = response.json()
                
                # Add JSON representation for each lora for potential Alpine.js usage
                for lora in featured_loras:
                    lora_data = {
                        "id": str(lora.get("id", "")),
                        "active": bool(lora.get("active", False)),
                        "name": str(lora.get("name", "")),
                        "version": str(lora.get("version", "")),
                        "viewMode": "featured",
                        "bulkMode": False
                    }
                    lora["json"] = json.dumps(lora_data)
            else:
                featured_loras = []
    except Exception:
        featured_loras = []

    return templates.TemplateResponse("partials/featured-loras.html", {
        "request": request,
        "featured_loras": featured_loras
    })
@router.get("/api/htmx/dashboard/activity-feed", response_class=HTMLResponse)
async def htmx_activity_feed(request: Request):
    """HTMX endpoint for loading activity feed on dashboard."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{frontend_settings.backend_url}/dashboard/activity-feed", timeout=5.0)
            if response.status_code == 200:
                activities = response.json()
            else:
                activities = []
    except Exception:
        activities = []
    
    return templates.TemplateResponse("partials/activity-feed.html", {
        "request": request,
        "activities": activities
    })

# HTMX API Endpoints for Recommendations
@router.post("/api/htmx/recommendations/similar", response_class=HTMLResponse)
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
        # Log validation error for observability and return partial with errors
        try:
            logger.warning("SimilarityForm validation failed", extra={"errors": ve.errors()})
        except Exception:
            logger.warning("SimilarityForm validation failed: %s", ve)
        errors = {e['loc'][0]: e['msg'] for e in ve.errors()}
        return templates.TemplateResponse("partials/similarity-results.html", {
            "request": request,
            "recommendations": [],
            "error": "Validation failed",
            "validation_errors": errors
        })
    except Exception as e:
        return templates.TemplateResponse("partials/similarity-results.html", {
            "request": request,
            "recommendations": [],
            "error": f"Invalid input: {e}"
        })
    """HTMX endpoint for similarity-based recommendations"""
    try:
        # Prepare parameters for backend API
        params = {
            'semantic_weight': form.semantic_weight,
            'artistic_weight': form.artistic_weight,
            'technical_weight': form.technical_weight,
            'limit': form.limit,
            'threshold': form.threshold
        }
        
        # Make request to backend API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{frontend_settings.backend_url}/v1/recommendations/similar/{form.lora_id}",
                params=params,
                timeout=30.0
            )
        
            if response.status_code == 200:
                recommendations = response.json()
                return templates.TemplateResponse("partials/similarity-results.html", {
                    "request": request,
                    "recommendations": recommendations,
                    "original_lora_id": form.lora_id,
                    "weights": {"semantic": form.semantic_weight, "artistic": form.artistic_weight, "technical": form.technical_weight}
                })
            else:
                error_msg = f"Backend API error: {response.status_code}"
                return templates.TemplateResponse("partials/similarity-results.html", {
                    "request": request,
                    "recommendations": [],
                    "error": error_msg
                })
    except Exception as e:
        return templates.TemplateResponse("partials/similarity-results.html", {
            "request": request,
            "recommendations": [], 
            "error": f"Error: {str(e)}"
        })

@router.post("/api/htmx/recommendations/prompt", response_class=HTMLResponse)
async def htmx_prompt_recommendations(request: Request):
    """HTMX endpoint for prompt-based recommendations"""
    try:
        data = await request.form()
        try:
            form = PromptForm(**{
                'prompt': data.get('prompt', ''),
                'semantic_weight': float(data.get('semantic_weight', 0.4)),
                'style_weight': float(data.get('style_weight', 0.3)),
                'context_weight': float(data.get('context_weight', 0.3)),
                'limit': int(data.get('limit', 10)),
            })
        except ValidationError as ve:
            # Log validation error for observability and return partial with errors
            try:
                logger.warning("PromptForm validation failed", extra={"errors": ve.errors()})
            except Exception:
                logger.warning("PromptForm validation failed: %s", ve)
            errors = {e['loc'][0]: e['msg'] for e in ve.errors()}
            return templates.TemplateResponse("partials/prompt-results.html", {
                "request": request,
                "recommendations": [],
                "error": "Validation failed",
                "validation_errors": errors
            })

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
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{frontend_settings.backend_url}/v1/recommendations/for-prompt",
                json=payload,
                timeout=30.0
            )
        
        if response.status_code == 200:
            data = response.json()
            return templates.TemplateResponse("partials/prompt-results.html", {
                "request": request,
                "recommendations": data.get('recommendations', []),
                "original_prompt": form.prompt,
                "processing_time_ms": data.get('processing_time_ms', 0),
                "analysis_summary": data.get('analysis_summary', {})
            })
        else:
            error_msg = f"Backend error: {response.status_code}"
            return templates.TemplateResponse("partials/prompt-results.html", {
                "request": request,
                "recommendations": [], 
                "original_prompt": form.prompt,
                "error": error_msg
            })
            
    except Exception as e:
        original_prompt = ''
        try:
            original_prompt = form.prompt if 'form' in locals() and hasattr(form, 'prompt') else ''
        except Exception:
            original_prompt = ''
        return templates.TemplateResponse("partials/prompt-results.html", {
            "request": request,
            "recommendations": [], 
            "original_prompt": original_prompt,
            "error": f"Error: {str(e)}"
        })

@router.get("/api/htmx/recommendations/embedding-status", response_class=HTMLResponse)
async def htmx_embedding_status(request: Request):
    """HTMX endpoint for embedding status and statistics"""
    try:
        # Make request to backend API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{frontend_settings.backend_url}/v1/recommendations/stats",
                timeout=10.0
            )
        
        if response.status_code == 200:
            data = response.json()
            
            # Structure the data for template
            context = {
                "request": request,
                'gpu_status': data.get('gpu_status', {
                    'available': False,
                    'device': 'CPU',
                    'memory_used_gb': 0,
                    'memory_total_gb': 0,
                    'memory_usage_percent': 0,
                    'utilization_percent': 0
                }),
                'embedding_stats': data.get('embedding_stats', {
                    'total_count': 0,
                    'processed_count': 0,
                    'coverage_percent': 0
                }),
                'performance': data.get('performance', {
                    'avg_search_time_ms': 0,
                    'searches_today': 0,
                    'cache_hit_rate': 0
                }),
                'is_computing': data.get('is_computing', False),
                'computation_progress': data.get('computation_progress'),
                'recent_activity': data.get('recent_activity', []),
                'config': data.get('config', {
                    'embedding_model': 'Unknown',
                    'embedding_dimensions': 'Unknown',
                    'batch_size': 'Unknown',
                    'index_type': 'Unknown'
                }),
                'embedding_breakdown': data.get('embedding_breakdown', {
                    'semantic': {'processed': 0, 'total': 0},
                    'artistic': {'processed': 0, 'total': 0},
                    'technical': {'processed': 0, 'total': 0}
                }),
                'search_stats': data.get('search_stats', {
                    'total_searches': 0,
                    'avg_results': 0,
                    'most_popular_type': 'unknown',
                    'success_rate': 0
                })
            }
            
            return templates.TemplateResponse("partials/embedding-status.html", context)
        else:
            # Return safe fallback for non-200 responses
            return HTMLResponse(
                content=f'''
                <div class="card">
                    <div class="card-header">
                        <h3 class="text-lg font-semibold text-gray-900">Embedding Status</h3>
                    </div>
                    <div class="p-4 text-center text-gray-500">
                        <p>Backend service unavailable</p>
                        <p class="text-sm">Status: {response.status_code}</p>
                    </div>
                </div>
                ''',
                status_code=200
            )
            
    except Exception as e:
        # Return safe fallback for any errors
        return HTMLResponse(
            content=f'''
            <div class="card">
                <div class="card-header">
                    <h3 class="text-lg font-semibold text-gray-900">Embedding Status</h3>
                </div>
                <div class="p-4 text-center text-gray-500">
                    <p>Unable to load embedding status</p>
                    <p class="text-sm">Error: Connection failed</p>
                </div>
            </div>
            ''',
            status_code=200
        )

@router.get("/api/htmx/recommendations/status/embeddings", response_class=HTMLResponse)
async def htmx_embeddings_status(request: Request):
    """HTMX endpoint for embeddings-specific status"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{frontend_settings.backend_url}/v1/recommendations/stats",
                timeout=10.0
            )
        
        if response.status_code == 200:
            data = response.json()
            embedding_stats = data.get('embedding_stats', {
                'total_count': 0,
                'processed_count': 0,
                'coverage_percent': 0
            })
            
            return HTMLResponse(
                content=f'''
                <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-600">Coverage</span>
                    <span class="text-sm font-medium text-blue-600">{embedding_stats.get('coverage_percent', 0):.1f}%</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-600">Processed</span>
                    <span class="text-sm font-medium">{embedding_stats.get('processed_count', 0)}/{embedding_stats.get('total_count', 0)}</span>
                </div>
                ''',
                status_code=200
            )
        else:
            return HTMLResponse(
                content='''
                <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-600">Status</span>
                    <span class="text-sm font-medium text-red-600">Unavailable</span>
                </div>
                ''',
                status_code=200
            )
    except Exception as e:
        return HTMLResponse(
            content='''
            <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Status</span>
                <span class="text-sm font-medium text-red-600">Error</span>
            </div>
            ''',
            status_code=200
        )

@router.get("/api/htmx/recommendations/status/performance", response_class=HTMLResponse)
async def htmx_performance_status(request: Request):
    """HTMX endpoint for performance-specific status"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{frontend_settings.backend_url}/v1/recommendations/stats",
                timeout=10.0
            )
        
        if response.status_code == 200:
            data = response.json()
            performance = data.get('performance', {
                'avg_search_time_ms': 0,
                'searches_today': 0,
                'cache_hit_rate': 0
            })
            
            return HTMLResponse(
                content=f'''
                <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-600">Avg Response</span>
                    <span class="text-sm font-medium text-purple-600">{performance.get('avg_search_time_ms', 0):.0f}ms</span>
                </div>
                <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-600">Cache Hit Rate</span>
                    <span class="text-sm font-medium">{performance.get('cache_hit_rate', 0):.1f}%</span>
                </div>
                ''',
                status_code=200
            )
        else:
            return HTMLResponse(
                content='''
                <div class="flex items-center justify-between">
                    <span class="text-sm text-gray-600">Status</span>
                    <span class="text-sm font-medium text-red-600">Unavailable</span>
                </div>
                ''',
                status_code=200
            )
    except Exception as e:
        return HTMLResponse(
            content='''
            <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Status</span>
                <span class="text-sm font-medium text-red-600">Error</span>
            </div>
            ''',
            status_code=200
        )

@router.get("/api/htmx/loras/available")
async def htmx_available_loras():
    """HTMX endpoint to get available LoRAs for selection"""
    try:
        # Make request to backend API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{frontend_settings.backend_url}/v1/adapters",
                timeout=10.0
            )
        
        if response.status_code == 200:
            data = response.json()
            return data
        else:
            return {
                'adapters': [], 
                'error': f'Backend error: {response.status_code}'
            }
            
    except Exception as e:
        return {'adapters': [], 'error': str(e)}


# Dashboard compatibility routes (legacy paths used in templates)
@router.get("/embedding-status", response_class=HTMLResponse)
async def embedding_status_legacy(request: Request):
    """Legacy embedding status endpoint - safely delegates to HTMX embedding status"""
    try:
        # Delegate to HTMX embedding status endpoint
        return await htmx_embedding_status(request)
    except Exception as e:
        # Return safe fallback HTML if backend/HTMX fails
        return HTMLResponse(
            content=f'''
            <div class="card">
                <div class="card-header">
                    <h3 class="text-lg font-semibold text-gray-900">Embedding Status</h3>
                </div>
                <div class="p-4 text-center text-gray-500">
                    <p>Embedding status temporarily unavailable</p>
                    <p class="text-sm mt-2">Error: {str(e)}</p>
                </div>
            </div>
            ''',
            status_code=200
        )


@router.get("/featured-loras", response_class=HTMLResponse)
async def featured_loras_legacy(request: Request):
    # Delegate to HTMX featured loRas partial
    return await htmx_featured_loras(request)


@router.get("/activity-feed", response_class=HTMLResponse)
async def activity_feed_legacy(request: Request):
    # Delegate to HTMX activity feed partial
    return await htmx_activity_feed(request)


from fastapi.responses import FileResponse

@router.get("/sw.js")
async def service_worker():
    """Serve the service worker at the site root (PWA expects /sw.js)."""
    sw_path = os.path.join("app", "frontend", "static", "sw.js")
    if os.path.exists(sw_path):
        return FileResponse(sw_path, media_type="application/javascript")
    else:
        # Return 404-like JS to avoid console errors
        return HTMLResponse(content='// no service worker available', status_code=404, media_type='application/javascript')


@router.get("/api/htmx/loras/grid", response_class=HTMLResponse, name="lora_grid")
async def lora_grid(request: Request):
    """HTMX endpoint for LoRA grid display - communicates with backend API properly."""
    import json
    
    try:
        # Extract parameters for backend API call
        page = int(request.query_params.get('page', 1))
        per_page = int(request.query_params.get('limit', 24))
        search = request.query_params.get('search', '')
        tags = request.query_params.get('tags', '')

        # Prepare parameters for backend API (matching the backend's expected format)
        params = {
            "page": page,
            "per_page": per_page,
            "search": search,
            "tags": tags
        }

        # Make HTTP request to backend API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{frontend_settings.backend_url}/v1/adapters",
                params=params,
                headers={"X-API-Key": "dev-api-key-123"},
                timeout=30.0
            )

        if response.status_code == 200:
            data = response.json()
            # Backend returns "items" array, transform to "loras" for template compatibility
            loras = data.get("items", [])
            total = data.get("total", 0)
            current_page = data.get("page", page)
            total_pages = data.get("pages", 1)
            
            # Add JSON representation for each lora for safe Alpine.js usage
            for lora in loras:
                # Create a safe JSON representation for x-data
                lora_data = {
                    "id": str(lora.get("id", "")),
                    "active": bool(lora.get("active", False)),
                    "name": str(lora.get("name", "")),
                    "version": str(lora.get("version", "")),
                    "viewMode": "grid",
                    "bulkMode": False
                }
                lora["json"] = json.dumps(lora_data)
            
            logger.info(f"Fetched {len(loras)} LoRAs from backend API (page {current_page}/{total_pages}, total: {total})")
        else:
            logger.error(f"Backend API returned status {response.status_code}: {response.text}")
            loras = []
            total = 0
            current_page = page
            total_pages = 1

    except httpx.RequestError as e:
        logger.error(f"Failed to connect to backend API at {frontend_settings.backend_url}: {e}")
        loras = []
        total = 0
        current_page = page
        total_pages = 1
    except Exception as e:
        logger.error(f"Unexpected error fetching LoRAs from backend API: {e}")
        loras = []
        total = 0
        current_page = page
        total_pages = 1

    # Render template with backend API data
    return templates.TemplateResponse("partials/lora-grid.html", {
        "request": request,
        "loras": loras,
        "pagination": {
            "start": (current_page - 1) * per_page + 1 if total > 0 else 0,
            "end": min(current_page * per_page, total),
            "total": total,
            "has_more": (current_page * per_page) < total,
            "next_url": f"{request.url.path}?page={current_page + 1}&limit={per_page}"
        },
        "view_mode": request.query_params.get('view', 'grid'),
        "bulk_mode": False,
        "search_term": search,
        "has_filters": bool(search or tags)
    })


# NOTE: Removed compatibility proxy for /api/v1/loras to harmonize frontend and backend paths.
# Frontend JS should call the backend directly using the exposed `window.BACKEND_URL`.


