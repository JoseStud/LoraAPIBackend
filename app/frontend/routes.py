"""
Frontend Routes Module

This module handles all frontend HTML routes for the LoRA Manager application.
It provides server-side rendered pages using Jinja2 templates with HTMX and Alpine.js integration.
"""

import httpx
from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse

router = APIRouter()
templates = Jinja2Templates(directory="app/frontend/templates")

"""
DEPRECATED: This file contains Flask-based routes that have been replaced 
by FastAPI routes in routes_fastapi.py. Keep for reference but do not import.
"""

# from flask import Blueprint, render_template, request, jsonify, flash, redirect, url_for
# import httpx
# import asyncio
# from typing import Dict, Any, Optional

# frontend = Blueprint('frontend', __name__)

@frontend.route('/')
def dashboard():
    """Main dashboard page"""
    return render_template('pages/dashboard.html')

@frontend.route('/loras')
def loras():
    """LoRA management page"""
    return render_template('pages/loras.html')

@frontend.route('/recommendations')
def recommendations():
    """AI Recommendations page"""
    return render_template('pages/recommendations.html')

# HTMX API Endpoints for Recommendations
@frontend.route('/api/htmx/recommendations/similar', methods=['POST'])
def htmx_similarity_recommendations():
    """HTMX endpoint for similarity-based recommendations"""
    try:
        # Get form data
        lora_id = request.form.get('lora_id')
        semantic_weight = float(request.form.get('semantic_weight', 0.4))
        artistic_weight = float(request.form.get('artistic_weight', 0.3)) 
        technical_weight = float(request.form.get('technical_weight', 0.3))
        limit = int(request.form.get('limit', 10))
        threshold = float(request.form.get('threshold', 0.1))
        
        if not lora_id:
            return render_template('partials/similarity-results.html', 
                                 recommendations=[], 
                                 error="Please select a LoRA to find similar items")
        
        # Call backend API
        backend_url = "http://localhost:8000"  # Should be configurable
        params = {
            'semantic_weight': semantic_weight,
            'artistic_weight': artistic_weight,
            'technical_weight': technical_weight,
            'limit': limit,
            'threshold': threshold
        }
        
        # Make synchronous request to backend
        import requests
        response = requests.get(
            f"{backend_url}/api/v1/recommendations/similar/{lora_id}",
            params=params,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            return render_template('partials/similarity-results.html', 
                                 recommendations=data.get('recommendations', []),
                                 processing_time_ms=data.get('processing_time_ms', 0),
                                 model_config=data.get('model_config', {}))
        else:
            error_msg = f"Backend error: {response.status_code}"
            return render_template('partials/similarity-results.html', 
                                 recommendations=[], 
                                 error=error_msg)
            
    except Exception as e:
        return render_template('partials/similarity-results.html', 
                             recommendations=[], 
                             error=f"Error: {str(e)}")

@frontend.route('/api/htmx/recommendations/prompt', methods=['POST'])
def htmx_prompt_recommendations():
    """HTMX endpoint for prompt-based recommendations"""
    try:
        # Get form data
        prompt = request.form.get('prompt', '').strip()
        semantic_weight = float(request.form.get('semantic_weight', 0.4))
        style_weight = float(request.form.get('style_weight', 0.3))
        context_weight = float(request.form.get('context_weight', 0.3))
        limit = int(request.form.get('limit', 10))
        
        if not prompt:
            return render_template('partials/prompt-results.html', 
                                 recommendations=[], 
                                 error="Please enter a prompt")
        
        # Call backend API
        backend_url = "http://localhost:8000"  # Should be configurable
        payload = {
            'prompt': prompt,
            'weights': {
                'semantic': semantic_weight,
                'style': style_weight,
                'context': context_weight
            },
            'limit': limit
        }
        
        # Make synchronous request to backend
        import requests
        response = requests.post(
            f"{backend_url}/api/v1/recommendations/for-prompt",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            return render_template('partials/prompt-results.html', 
                                 recommendations=data.get('recommendations', []),
                                 original_prompt=prompt,
                                 processing_time_ms=data.get('processing_time_ms', 0),
                                 analysis_summary=data.get('analysis_summary', {}))
        else:
            error_msg = f"Backend error: {response.status_code}"
            return render_template('partials/prompt-results.html', 
                                 recommendations=[], 
                                 original_prompt=prompt,
                                 error=error_msg)
            
    except Exception as e:
        return render_template('partials/prompt-results.html', 
                             recommendations=[], 
                             original_prompt=prompt if 'prompt' in locals() else '',
                             error=f"Error: {str(e)}")

@frontend.route('/api/htmx/recommendations/embedding-status', methods=['GET'])
def htmx_embedding_status():
    """HTMX endpoint for embedding status and statistics"""
    try:
        # Call backend API for status
        backend_url = "http://localhost:8000"  # Should be configurable
        
        import requests
        response = requests.get(
            f"{backend_url}/api/v1/recommendations/stats",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Structure the data for template
            context = {
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
            
            return render_template('partials/embedding-status.html', **context)
        else:
            error_msg = f"Backend error: {response.status_code}"
            return f'<div class="text-red-600 p-4">Error loading status: {error_msg}</div>'
            
    except Exception as e:
        return f'<div class="text-red-600 p-4">Error: {str(e)}</div>'

@frontend.route('/api/htmx/loras/available', methods=['GET'])
def htmx_available_loras():
    """HTMX endpoint to get available LoRAs for selection"""
    try:
        # Call backend API
        backend_url = "http://localhost:8000"  # Should be configurable
        
        import requests
        response = requests.get(
            f"{backend_url}/api/v1/adapters",
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            return jsonify(data)
        else:
            return jsonify({'adapters': [], 'error': f'Backend error: {response.status_code}'}), response.status_code
            
    except Exception as e:
        return jsonify({'adapters': [], 'error': str(e)}), 500

@router.get("/loras/{lora_id}", response_class=HTMLResponse)
async def lora_details(request: Request, lora_id: str):
    """
    Detailed view and management of individual LoRA.
    
    Features:
    - Full metadata display and editing
    - AI-powered recommendations
    - Preview generation
    - Usage statistics
    """
    return templates.TemplateResponse("pages/lora_details.html", {
        "request": request,
        "title": "LoRA Details",
        "page": "lora_details",
        "lora_id": lora_id
    })

@router.get("/recommendations", response_class=HTMLResponse)
async def recommendations(request: Request):
    """
    AI-powered LoRA discovery and recommendations interface.
    
    Features:
    - Prompt-based recommendations
    - Similarity exploration
    - Recommendation tuning
    - Batch embedding computation
    """
    return templates.TemplateResponse("pages/recommendations.html", {
        "request": request,
        "title": "AI Recommendations",
        "page": "recommendations"
    })

@router.get("/compose", response_class=HTMLResponse)
async def prompt_composer(request: Request):
    """
    Interactive prompt building with LoRA integration.
    
    Features:
    - Drag-and-drop LoRA ordering
    - Real-time prompt preview
    - Weight adjustment
    - Delivery mode selection
    """
    return templates.TemplateResponse("pages/compose.html", {
        "request": request,
        "title": "Prompt Composer",
        "page": "compose"
    })

@router.get("/generate", response_class=HTMLResponse)
async def generation_studio(request: Request):
    """
    Image generation studio with LoRA integration.
    
    Features:
    - Parameter configuration
    - Real-time progress monitoring
    - Generation history
    - Batch generation queue
    """
    return templates.TemplateResponse("pages/generate.html", {
        "request": request,
        "title": "Generation Studio",
        "page": "generate"
    })

@router.get("/admin", response_class=HTMLResponse)
async def system_management(request: Request):
    """
    System administration and monitoring interface.
    
    Features:
    - Import/export tools
    - Database management
    - Worker status monitoring
    - Performance analytics
    """
    return templates.TemplateResponse("pages/admin.html", {
        "request": request,
        "title": "System Management",
        "page": "admin"
    })

# HTMX Partial Routes
@router.get("/api/htmx/dashboard/featured-loras", response_class=HTMLResponse)
async def htmx_featured_loras(request: Request):
    """HTMX endpoint for loading featured LoRAs on dashboard."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:8000/api/dashboard/featured-loras")
            if response.status_code == 200:
                featured_loras = response.json()
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
            response = await client.get("http://localhost:8000/api/dashboard/activity-feed")
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

@router.get("/api/htmx/loras/grid", response_class=HTMLResponse)
async def htmx_lora_grid(request: Request, 
                        search: str = "", 
                        active_only: bool = False,
                        tags: str = "",
                        sort: str = "name",
                        view: str = "grid",
                        page: int = 1,
                        per_page: int = 24):
    """HTMX endpoint for loading LoRA grid with filtering and pagination."""
    try:
        # Build query parameters
        params = {
            "search": search,
            "active_only": active_only,
            "sort": sort,
            "page": page,
            "per_page": per_page
        }
        
        if tags:
            params["tags"] = tags
        
        async with httpx.AsyncClient() as client:
            response = await client.get("http://localhost:8000/api/v1/adapters", params=params)
            if response.status_code == 200:
                data = response.json()
                loras = data.get("items", [])
                total_count = data.get("total", 0)
                filtered_count = data.get("filtered", 0)
                current_page = data.get("page", 1)
                total_pages = data.get("pages", 1)
            else:
                loras = []
                total_count = 0
                filtered_count = 0
                current_page = 1
                total_pages = 1
    except Exception as e:
        print(f"Error fetching LoRAs: {e}")
        loras = []
        total_count = 0
        filtered_count = 0
        current_page = 1
        total_pages = 1
    
    return templates.TemplateResponse("partials/lora-grid.html", {
        "request": request,
        "loras": loras,
        "view_mode": view,
        "bulk_mode": False,
        "search_term": search,
        "has_filters": active_only or tags or sort != "name",
        "total_count": total_count,
        "filtered_count": filtered_count,
        "current_page": current_page,
        "total_pages": total_pages
    })
