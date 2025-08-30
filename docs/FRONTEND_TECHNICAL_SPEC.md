# Frontend Technical Specification

## HTMX Integration Patterns

### 1. HTMX Endpoint Mapping

```python
# app/frontend/htmx_routes.py
from fastapi import APIRouter, Request, Depends, Query
from fastapi.templating import Jinja2Templates
from typing import Optional, List

router = APIRouter(prefix="/api/htmx", tags=["htmx"])
templates = Jinja2Templates(directory="app/frontend/templates")

@router.get("/loras/grid")
async def lora_grid(
    request: Request,
    active: Optional[bool] = None,
    search: Optional[str] = None,
    tags: Optional[List[str]] = Query(None),
    limit: int = 20,
    offset: int = 0
):
    """Return LoRA grid partial for HTMX updates"""
    # Filter and paginate LoRAs based on parameters
    loras = await get_filtered_loras(active, search, tags, limit, offset)
    
    return templates.TemplateResponse("partials/lora_grid.html", {
        "request": request,
        "loras": loras,
        "has_more": len(loras) == limit
    })

@router.get("/recommendations/similar")
async def similar_recommendations(
    request: Request,
    target_id: str,
    limit: int = 6,
    similarity_threshold: float = 0.3,
    weights: Optional[str] = None  # JSON string of weights
):
    """Return similar LoRA recommendations partial"""
    import json
    weights_dict = json.loads(weights) if weights else None
    
    recommendations = await get_similar_loras(
        target_id, limit, similarity_threshold, weights_dict
    )
    
    return templates.TemplateResponse("partials/recommendation_cards.html", {
        "request": request,
        "recommendations": recommendations,
        "target_id": target_id
    })

@router.get("/generation/progress/{job_id}")
async def generation_progress(request: Request, job_id: str):
    """Return generation progress partial"""
    job_status = await get_generation_job_status(job_id)
    
    return templates.TemplateResponse("partials/progress_bar.html", {
        "request": request,
        "job": job_status
    })

@router.post("/loras/{lora_id}/toggle")
async def toggle_lora_active(request: Request, lora_id: str):
    """Toggle LoRA active status and return updated card"""
    lora = await toggle_lora_activation(lora_id)
    
    return templates.TemplateResponse("partials/lora_card.html", {
        "request": request,
        "lora": lora
    })

@router.post("/compose/add-lora")
async def add_lora_to_composition(
    request: Request,
    lora_id: str,
    weight: float = 1.0
):
    """Add LoRA to active composition"""
    composition = await add_to_composition(lora_id, weight)
    
    return templates.TemplateResponse("partials/composition_list.html", {
        "request": request,
        "composition": composition
    })
```

### 2. Template Partials Structure

```html
<!-- templates/partials/lora_card.html -->
<div class="lora-card group" 
     id="lora-{{ lora.id }}"
     x-data="loraCard({{ lora|tojson }})">
    
    <!-- LoRA Image/Preview -->
    <div class="relative overflow-hidden rounded-lg mb-3">
        {% if lora.preview_image %}
            <img src="{{ lora.preview_image }}" 
                 alt="{{ lora.name }}"
                 class="w-full h-48 object-cover group-hover:scale-105 transition-transform">
        {% else %}
            <div class="w-full h-48 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                <span class="text-gray-500 text-4xl">📎</span>
            </div>
        {% endif %}
        
        <!-- Active indicator -->
        <div class="absolute top-2 right-2">
            <button @click="toggleActive()"
                    hx-post="/api/htmx/loras/{{ lora.id }}/toggle"
                    hx-target="#lora-{{ lora.id }}"
                    hx-swap="outerHTML"
                    :class="active ? 'bg-green-500' : 'bg-gray-400'"
                    class="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center">
                ✓
            </button>
        </div>
    </div>
    
    <!-- LoRA Info -->
    <div class="space-y-2">
        <h3 class="font-semibold text-gray-900 truncate" title="{{ lora.name }}">
            {{ lora.name }}
        </h3>
        
        {% if lora.description %}
            <p class="text-sm text-gray-600 line-clamp-2">{{ lora.description }}</p>
        {% endif %}
        
        <!-- Tags -->
        {% if lora.tags %}
            <div class="flex flex-wrap gap-1">
                {% for tag in lora.tags[:3] %}
                    <span class="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                        {{ tag }}
                    </span>
                {% endfor %}
                {% if lora.tags|length > 3 %}
                    <span class="text-xs text-gray-500">+{{ lora.tags|length - 3 }} more</span>
                {% endif %}
            </div>
        {% endif %}
        
        <!-- Weight slider (for active LoRAs) -->
        {% if lora.active %}
            <div class="space-y-1">
                <label class="text-xs text-gray-600">Weight: <span x-text="weight"></span></label>
                <input type="range" 
                       x-model="weight"
                       @input="updateWeight()"
                       min="0" max="2" step="0.1"
                       class="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer">
            </div>
        {% endif %}
        
        <!-- Actions -->
        <div class="flex space-x-1">
            <button @click="viewDetails()" 
                    class="flex-1 px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                Details
            </button>
            <button @click="getSimilar()" 
                    hx-get="/api/htmx/recommendations/similar"
                    hx-vals='{"target_id": "{{ lora.id }}"}'
                    hx-target="#recommendations-modal .modal-content"
                    hx-trigger="click"
                    class="flex-1 px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 rounded">
                Similar
            </button>
        </div>
    </div>
</div>
```

```html
<!-- templates/partials/recommendation_cards.html -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {% for rec in recommendations %}
        <div class="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow">
            <!-- Recommendation score -->
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center space-x-2">
                    <div class="w-12 h-12 bg-gradient-to-br from-green-400 to-blue-500 rounded-full flex items-center justify-center text-white font-bold">
                        {{ (rec.similarity_score * 100)|round }}
                    </div>
                    <div>
                        <div class="text-xs text-gray-500">Similarity</div>
                        <div class="text-lg font-semibold">{{ (rec.similarity_score * 100)|round }}%</div>
                    </div>
                </div>
            </div>
            
            <!-- LoRA info -->
            <h4 class="font-semibold text-gray-900 mb-2">{{ rec.lora_name }}</h4>
            
            {% if rec.lora_description %}
                <p class="text-sm text-gray-600 mb-3 line-clamp-3">{{ rec.lora_description }}</p>
            {% endif %}
            
            <!-- Similarity breakdown -->
            <div class="space-y-1 mb-4">
                <div class="flex justify-between text-xs">
                    <span>Semantic</span>
                    <span>{{ (rec.semantic_similarity * 100)|round }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1">
                    <div class="bg-blue-500 h-1 rounded-full" 
                         style="width: {{ rec.semantic_similarity * 100 }}%"></div>
                </div>
                
                <div class="flex justify-between text-xs">
                    <span>Artistic</span>
                    <span>{{ (rec.artistic_similarity * 100)|round }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1">
                    <div class="bg-purple-500 h-1 rounded-full" 
                         style="width: {{ rec.artistic_similarity * 100 }}%"></div>
                </div>
                
                <div class="flex justify-between text-xs">
                    <span>Technical</span>
                    <span>{{ (rec.technical_similarity * 100)|round }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1">
                    <div class="bg-green-500 h-1 rounded-full" 
                         style="width: {{ rec.technical_similarity * 100 }}%"></div>
                </div>
            </div>
            
            <!-- Explanation -->
            {% if rec.explanation %}
                <p class="text-xs text-gray-600 italic mb-3">"{{ rec.explanation }}"</p>
            {% endif %}
            
            <!-- Actions -->
            <div class="flex space-x-2">
                <button onclick="viewLoraDetails('{{ rec.lora_id }}')" 
                        class="flex-1 px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded">
                    View Details
                </button>
                <button onclick="addToComposition('{{ rec.lora_id }}')"
                        hx-post="/api/htmx/compose/add-lora"
                        hx-vals='{"lora_id": "{{ rec.lora_id }}"}'
                        hx-target="#composition-list"
                        class="flex-1 px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 rounded">
                    Add to Mix
                </button>
            </div>
        </div>
    {% endfor %}
</div>

{% if not recommendations %}
    <div class="text-center py-8">
        <div class="text-gray-400 text-4xl mb-2">🔍</div>
        <p class="text-gray-600">No similar LoRAs found</p>
        <p class="text-sm text-gray-500">Try adjusting the similarity threshold or weights</p>
    </div>
{% endif %}
```

## Alpine.js Component Library

### 1. Core Components

```javascript
// app/frontend/static/js/components/lora-card.js
function loraCard(initialData) {
    return {
        id: initialData.id,
        name: initialData.name,
        active: initialData.active,
        weight: initialData.weight || 1.0,
        
        async toggleActive() {
            try {
                // Optimistic update
                this.active = !this.active;
                
                // API call will be handled by HTMX
                // This is just for immediate UI feedback
            } catch (error) {
                // Revert on error
                this.active = !this.active;
                console.error('Failed to toggle LoRA:', error);
            }
        },
        
        async updateWeight() {
            // Debounced weight update
            clearTimeout(this.weightTimeout);
            this.weightTimeout = setTimeout(async () => {
                try {
                    await fetch(`/api/v1/adapters/${this.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ weight: parseFloat(this.weight) })
                    });
                } catch (error) {
                    console.error('Failed to update weight:', error);
                }
            }, 500);
        },
        
        viewDetails() {
            window.location.href = `/loras/${this.id}`;
        },
        
        getSimilar() {
            // This will trigger HTMX request
            document.getElementById('recommendations-modal').classList.remove('hidden');
        }
    };
}

// app/frontend/static/js/components/search-filter.js
function searchFilter() {
    return {
        searchTerm: '',
        filters: {
            activeOnly: false,
            tags: [],
            minQuality: 0
        },
        availableTags: [],
        
        init() {
            this.loadAvailableTags();
            // Restore from URL params
            const params = new URLSearchParams(window.location.search);
            this.searchTerm = params.get('search') || '';
            this.filters.activeOnly = params.get('active') === 'true';
        },
        
        async loadAvailableTags() {
            try {
                const response = await fetch('/api/v1/adapters/tags');
                this.availableTags = await response.json();
            } catch (error) {
                console.error('Failed to load tags:', error);
            }
        },
        
        search() {
            this.updateURL();
            this.triggerUpdate();
        },
        
        applyFilters() {
            this.updateURL();
            this.triggerUpdate();
        },
        
        clearFilters() {
            this.searchTerm = '';
            this.filters = {
                activeOnly: false,
                tags: [],
                minQuality: 0
            };
            this.updateURL();
            this.triggerUpdate();
        },
        
        updateURL() {
            const params = new URLSearchParams();
            if (this.searchTerm) params.set('search', this.searchTerm);
            if (this.filters.activeOnly) params.set('active', 'true');
            this.filters.tags.forEach(tag => params.append('tag', tag));
            
            window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
        },
        
        triggerUpdate() {
            document.body.dispatchEvent(new CustomEvent('search-changed', {
                detail: {
                    search: this.searchTerm,
                    filters: this.filters
                }
            }));
        }
    };
}

// app/frontend/static/js/components/similarity-explorer.js
function similarityExplorer() {
    return {
        targetLoraId: '',
        availableLoras: [],
        weights: {
            semantic: 0.4,
            artistic: 0.3,
            technical: 0.3
        },
        similarityThreshold: 0.3,
        loading: false,
        
        init() {
            this.loadAvailableLoras();
        },
        
        async loadAvailableLoras() {
            try {
                const response = await fetch('/api/v1/adapters?limit=1000');
                const data = await response.json();
                this.availableLoras = data.items;
            } catch (error) {
                console.error('Failed to load LoRAs:', error);
            }
        },
        
        async findSimilar() {
            if (!this.targetLoraId) return;
            
            this.loading = true;
            
            // Trigger HTMX request
            document.body.dispatchEvent(new CustomEvent('similarity-search', {
                detail: {
                    target_id: this.targetLoraId,
                    weights: this.weights,
                    similarity_threshold: this.similarityThreshold
                }
            }));
            
            // Loading will be handled by HTMX indicators
            setTimeout(() => this.loading = false, 1000);
        },
        
        resetWeights() {
            this.weights = {
                semantic: 0.4,
                artistic: 0.3,
                technical: 0.3
            };
            this.findSimilar();
        },
        
        // Watch for weight changes
        get weightsSum() {
            return Object.values(this.weights).reduce((a, b) => a + b, 0);
        },
        
        normalizeWeights() {
            const sum = this.weightsSum;
            if (sum > 0) {
                Object.keys(this.weights).forEach(key => {
                    this.weights[key] = this.weights[key] / sum;
                });
            }
        }
    };
}

// app/frontend/static/js/components/prompt-composer.js
function promptComposer() {
    return {
        activeLoras: [],
        generatedPrompt: '',
        prefix: '',
        suffix: '',
        
        init() {
            this.loadActiveLoras();
            this.$watch('activeLoras', () => this.updatePrompt());
            this.$watch('prefix', () => this.updatePrompt());
            this.$watch('suffix', () => this.updatePrompt());
        },
        
        async loadActiveLoras() {
            try {
                const response = await fetch('/api/v1/adapters?active=true');
                const data = await response.json();
                this.activeLoras = data.items.sort((a, b) => (a.ordinal || 999) - (b.ordinal || 999));
                this.updatePrompt();
            } catch (error) {
                console.error('Failed to load active LoRAs:', error);
            }
        },
        
        updatePrompt() {
            const loraTokens = this.activeLoras.map(lora => 
                `<lora:${lora.name}:${lora.weight.toFixed(1)}>`
            );
            
            const parts = [
                this.prefix.trim(),
                ...loraTokens,
                this.suffix.trim()
            ].filter(part => part.length > 0);
            
            this.generatedPrompt = parts.join(' ');
        },
        
        async updateLoraWeight(loraId, weight) {
            const lora = this.activeLoras.find(l => l.id === loraId);
            if (lora) {
                lora.weight = weight;
                
                // Update in backend
                try {
                    await fetch(`/api/v1/adapters/${loraId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ weight: weight })
                    });
                } catch (error) {
                    console.error('Failed to update weight:', error);
                }
            }
        },
        
        removeLora(loraId) {
            this.activeLoras = this.activeLoras.filter(l => l.id !== loraId);
            
            // Deactivate in backend
            fetch(`/api/v1/adapters/${loraId}/deactivate`, { method: 'POST' })
                .catch(error => console.error('Failed to deactivate LoRA:', error));
        },
        
        async copyPrompt() {
            try {
                await navigator.clipboard.writeText(this.generatedPrompt);
                // Show toast notification
                this.showToast('Prompt copied to clipboard!');
            } catch (error) {
                console.error('Failed to copy prompt:', error);
            }
        },
        
        async generateImage() {
            if (!this.generatedPrompt.trim()) return;
            
            try {
                const response = await fetch('/api/v1/generation/compose-and-generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        prefix: this.prefix,
                        suffix: this.suffix,
                        // Additional generation parameters
                        steps: 20,
                        cfg_scale: 7.0,
                        width: 512,
                        height: 512
                    })
                });
                
                const job = await response.json();
                
                // Redirect to generation monitoring page
                window.location.href = `/generate/job/${job.id}`;
            } catch (error) {
                console.error('Failed to start generation:', error);
            }
        },
        
        showToast(message) {
            // Simple toast implementation
            const toast = document.createElement('div');
            toast.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50';
            toast.textContent = message;
            document.body.appendChild(toast);
            
            setTimeout(() => {
                toast.remove();
            }, 3000);
        }
    };
}
```

### 2. WebSocket Integration

```javascript
// app/frontend/static/js/components/generation-monitor.js
function generationMonitor() {
    return {
        activeJobs: [],
        ws: null,
        connectionStatus: 'disconnected',
        
        init() {
            this.connectWebSocket();
            this.loadActiveJobs();
        },
        
        connectWebSocket() {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/progress`;
            
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                this.connectionStatus = 'connected';
                console.log('WebSocket connected');
            };
            
            this.ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleProgressUpdate(data);
            };
            
            this.ws.onclose = () => {
                this.connectionStatus = 'disconnected';
                console.log('WebSocket disconnected');
                
                // Attempt to reconnect after 3 seconds
                setTimeout(() => this.connectWebSocket(), 3000);
            };
            
            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        },
        
        handleProgressUpdate(data) {
            const { job_id, progress, status, result } = data;
            
            const jobIndex = this.activeJobs.findIndex(job => job.id === job_id);
            
            if (jobIndex !== -1) {
                // Update existing job
                this.activeJobs[jobIndex] = {
                    ...this.activeJobs[jobIndex],
                    progress,
                    status,
                    result: result || this.activeJobs[jobIndex].result
                };
                
                // Remove completed jobs after a delay
                if (status === 'completed' || status === 'failed') {
                    setTimeout(() => {
                        this.activeJobs = this.activeJobs.filter(job => job.id !== job_id);
                    }, 5000);
                }
            }
        },
        
        async loadActiveJobs() {
            try {
                const response = await fetch('/api/v1/generation/jobs?status=pending,running');
                const jobs = await response.json();
                this.activeJobs = jobs;
            } catch (error) {
                console.error('Failed to load active jobs:', error);
            }
        },
        
        async cancelJob(jobId) {
            try {
                await fetch(`/api/v1/generation/jobs/${jobId}/cancel`, {
                    method: 'POST'
                });
                
                // Remove from active jobs
                this.activeJobs = this.activeJobs.filter(job => job.id !== jobId);
            } catch (error) {
                console.error('Failed to cancel job:', error);
            }
        },
        
        getStatusColor(status) {
            const colors = {
                pending: 'bg-yellow-500',
                running: 'bg-blue-500',
                completed: 'bg-green-500',
                failed: 'bg-red-500'
            };
            return colors[status] || 'bg-gray-500';
        },
        
        formatDuration(startTime, endTime) {
            if (!startTime) return 'Not started';
            
            const start = new Date(startTime);
            const end = endTime ? new Date(endTime) : new Date();
            const duration = Math.floor((end - start) / 1000);
            
            if (duration < 60) return `${duration}s`;
            if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
            return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
        }
    };
}
```

## Tailwind CSS Custom Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: [
    "./app/frontend/templates/**/*.html",
    "./app/frontend/static/js/**/*.js",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        accent: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        }
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/line-clamp'),
  ],
}
```

This technical specification provides the detailed implementation patterns needed to build the frontend with HTMX, Alpine.js, and Tailwind CSS, creating a responsive and interactive interface that fully leverages the AI recommendation system and existing FastAPI backend.
