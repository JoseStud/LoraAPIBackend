"""
Frontend Routes for LoRA Manager

FastAPI routes that serve HTML templates and ha            if response.statu    except Exception as e:
        return templates.TemplateResponse("partials/prompt-results-refactored.html", {
            "request": request,
            "recommendations": [], 
            "error": f"Error: {str(e)}"
        }) == 200:
                recommendations = response.json()
                return templates.TemplateResponse("partials/prompt-results-refactored.html", {
                    "request": request,
                    "recommendations": recommendations,
                    "original_prompt": prompt,
                    "weights": {"semantic": semantic_weight, "artistic": artistic_weight, "technical": technical_weight}
                })
            else:
                error_msg = f"Backend API error: {response.status_code}"
                return templates.TemplateResponse("partials/prompt-results-refactored.html", {
                    "request": request,
                    "recommendations": [],
                    "error": error_msg
                })sts
for the AI Recommendations interface.
"""

from fastapi import APIRouter, Request, Form, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
import httpx
import asyncio
from typing import Optional
import os

# Create router for frontend routes
router = APIRouter()

# Initialize templates
templates = Jinja2Templates(directory="app/frontend/templates")

# Backend URL - should be configurable via environment
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

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

# HTMX API Endpoints for Recommendations
@router.post("/api/htmx/recommendations/similar", response_class=HTMLResponse)
async def htmx_similarity_recommendations(
    request: Request,
    lora_id: str = Form(...),
    semantic_weight: float = Form(0.4),
    artistic_weight: float = Form(0.3),
    technical_weight: float = Form(0.3),
    limit: int = Form(10),
    threshold: float = Form(0.1)
):
    """HTMX endpoint for similarity-based recommendations"""
    try:
        if not lora_id:
            return templates.TemplateResponse("partials/similarity-results-refactored.html", {
                "request": request,
                "recommendations": [], 
                "error": "Please select a LoRA to find similar items"
            })
        
        # Prepare parameters for backend API
        params = {
            'semantic_weight': semantic_weight,
            'artistic_weight': artistic_weight,
            'technical_weight': technical_weight,
            'limit': limit,
            'threshold': threshold
        }
        
        # Make request to backend API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BACKEND_URL}/api/v1/recommendations/similar/{lora_id}",
                params=params,
                timeout=30.0
            )
        
            if response.status_code == 200:
                recommendations = response.json()
                return templates.TemplateResponse("partials/similarity-results-refactored.html", {
                    "request": request,
                    "recommendations": recommendations,
                    "original_lora_id": lora_id,
                    "weights": {"semantic": semantic_weight, "artistic": artistic_weight, "technical": technical_weight}
                })
            else:
                error_msg = f"Backend API error: {response.status_code}"
                return templates.TemplateResponse("partials/similarity-results-refactored.html", {
                    "request": request,
                    "recommendations": [],
                    "error": error_msg
                })
    except Exception as e:
        return templates.TemplateResponse("partials/similarity-results-refactored.html", {
            "request": request,
            "recommendations": [], 
            "error": f"Error: {str(e)}"
        })

@router.post("/api/htmx/recommendations/prompt", response_class=HTMLResponse)
async def htmx_prompt_recommendations(
    request: Request,
    prompt: str = Form(...),
    semantic_weight: float = Form(0.4),
    style_weight: float = Form(0.3),
    context_weight: float = Form(0.3),
    limit: int = Form(10)
):
    """HTMX endpoint for prompt-based recommendations"""
    try:
        if not prompt:
            return templates.TemplateResponse("partials/prompt-results-refactored.html", {
                "request": request,
                "recommendations": [], 
                "error": "Please enter a prompt to get recommendations"
            })
        
        # Prepare payload for backend API
        payload = {
            'prompt': prompt.strip(),
            'weights': {
                'semantic': semantic_weight,
                'style': style_weight,
                'context': context_weight
            },
            'limit': limit
        }
        
        # Make request to backend API
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BACKEND_URL}/api/v1/recommendations/for-prompt",
                json=payload,
                timeout=30.0
            )
        
        if response.status_code == 200:
            data = response.json()
            return templates.TemplateResponse("partials/prompt-results.html", {
                "request": request,
                "recommendations": data.get('recommendations', []),
                "original_prompt": prompt,
                "processing_time_ms": data.get('processing_time_ms', 0),
                "analysis_summary": data.get('analysis_summary', {})
            })
        else:
            error_msg = f"Backend error: {response.status_code}"
            return templates.TemplateResponse("partials/prompt-results.html", {
                "request": request,
                "recommendations": [], 
                "original_prompt": prompt,
                "error": error_msg
            })
            
    except Exception as e:
        return templates.TemplateResponse("partials/prompt-results.html", {
            "request": request,
            "recommendations": [], 
            "original_prompt": prompt if 'prompt' in locals() else '',
            "error": f"Error: {str(e)}"
        })

@router.get("/api/htmx/recommendations/embedding-status", response_class=HTMLResponse)
async def htmx_embedding_status(request: Request):
    """HTMX endpoint for embedding status and statistics"""
    try:
        # Make request to backend API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BACKEND_URL}/api/v1/recommendations/stats",
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
            
            return templates.TemplateResponse("partials/embedding-status-refactored.html", context)
        else:
            error_msg = f"Backend error: {response.status_code}"
            return HTMLResponse(
                content=f'<div class="text-red-600 p-4">Error loading status: {error_msg}</div>',
                status_code=response.status_code
            )
            
    except Exception as e:
        return HTMLResponse(
            content=f'<div class="text-red-600 p-4">Error: {str(e)}</div>',
            status_code=500
        )

@router.get("/api/htmx/loras/available")
async def htmx_available_loras():
    """HTMX endpoint to get available LoRAs for selection"""
    try:
        # Make request to backend API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{BACKEND_URL}/api/v1/adapters",
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
