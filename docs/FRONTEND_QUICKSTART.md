# Frontend Implementation Quick Start Guide

## 🚀 Getting Started

This guide provides step-by-step instructions to implement the frontend for the LoRA Manager using FastAPI + HTMX + Alpine.js + Tailwind CSS.

## 📋 Prerequisites

- Existing FastAPI backend (already implemented)
- Node.js 18+ (for Tailwind CSS build process)
- Python 3.10+ (already set up)

## 🛠️ Installation Steps

### 1. Install Frontend Dependencies

```bash
# Navigate to project root
cd /home/anxilinux/DeepVault/models/Lora/Plans/docs/backend-api

# Initialize npm for frontend build tools
npm init -y

# Install Tailwind CSS and build tools
npm install -D tailwindcss @tailwindcss/forms @tailwindcss/typography @tailwindcss/line-clamp
npm install -D postcss autoprefixer

# Install HTMX and Alpine.js via CDN (no npm needed)
# These will be included via CDN in templates
```

### 2. Configure Tailwind CSS

```bash
# Generate Tailwind config
npx tailwindcss init -p

# Create CSS input file
mkdir -p app/frontend/static/css
touch app/frontend/static/css/input.css
```

### 3. Project Structure Setup

```bash
# Create frontend directory structure
mkdir -p app/frontend/{templates/{base,pages,partials,components},static/{css,js,images}}
mkdir -p app/frontend/static/js/components
mkdir -p app/frontend/templates/{base,pages,partials,components}

# Create main files
touch app/frontend/__init__.py
touch app/frontend/routes.py
touch app/frontend/htmx_routes.py
```

## 📁 File Structure

```
app/frontend/
├── __init__.py
├── routes.py                   # Main page routes
├── htmx_routes.py             # HTMX partial endpoints
├── static/
│   ├── css/
│   │   ├── input.css          # Tailwind input
│   │   └── styles.css         # Generated output
│   ├── js/
│   │   ├── alpine-config.js   # Alpine.js configuration
│   │   ├── htmx-config.js     # HTMX configuration
│   │   └── components/        # Alpine.js components
│   │       ├── lora-card.js
│   │       ├── search-filter.js
│   │       ├── similarity-explorer.js
│   │       └── prompt-composer.js
│   └── images/
└── templates/
    ├── base/
    │   ├── layout.html        # Main layout template
    │   └── components.html    # Reusable components
    ├── pages/
    │   ├── dashboard.html     # Main dashboard
    │   ├── loras.html         # LoRA gallery
    │   ├── lora_detail.html   # Individual LoRA page
    │   ├── recommendations.html # AI recommendations
    │   ├── compose.html       # Prompt composer
    │   └── generate.html      # Generation studio
    ├── partials/              # HTMX partials
    │   ├── lora_grid.html
    │   ├── lora_card.html
    │   ├── recommendation_cards.html
    │   ├── progress_bar.html
    │   └── composition_list.html
    └── components/            # Reusable template components
        ├── modal.html
        ├── toast.html
        └── loading.html
```

## 🎨 Initial Implementation

### 1. Tailwind CSS Input File

```css
/* app/frontend/static/css/input.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom component styles */
@layer components {
  .btn-primary {
    @apply bg-primary-500 hover:bg-primary-600 text-white font-medium py-2 px-4 rounded-lg transition-colors;
  }
  
  .btn-secondary {
    @apply bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors;
  }
  
  .card {
    @apply bg-white rounded-lg shadow-md p-6;
  }
  
  .lora-card {
    @apply bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-4;
  }
  
  .form-input {
    @apply w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500;
  }
  
  .form-label {
    @apply block text-sm font-medium text-gray-700 mb-1;
  }
  
  .badge {
    @apply inline-block px-2 py-1 text-xs font-medium rounded;
  }
  
  .badge-blue {
    @apply badge bg-blue-100 text-blue-800;
  }
  
  .badge-green {
    @apply badge bg-green-100 text-green-800;
  }
  
  .badge-gray {
    @apply badge bg-gray-100 text-gray-800;
  }
}

/* Custom utilities */
@layer utilities {
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  .line-clamp-3 {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
```

### 2. Base Layout Template

```html
<!-- app/frontend/templates/base/layout.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}LoRA Manager{% endblock %}</title>
    
    <!-- Tailwind CSS -->
    <link href="{{ url_for('static', path='frontend/static/css/styles.css') }}" rel="stylesheet">
    
    <!-- HTMX -->
    <script src="https://unpkg.com/htmx.org@1.9.10"></script>
    
    <!-- Alpine.js -->
    <script defer src="https://unpkg.com/alpinejs@3.13.5/dist/cdn.min.js"></script>
    
    <!-- Custom styles -->
    <style>
        [x-cloak] { display: none !important; }
    </style>
</head>
<body class="bg-gray-50 min-h-screen" x-data="{ sidebarOpen: false }">
    <!-- Navigation -->
    <nav class="bg-white shadow-sm border-b">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex justify-between h-16">
                <!-- Logo and main nav -->
                <div class="flex items-center space-x-8">
                    <div class="flex-shrink-0">
                        <h1 class="text-xl font-bold text-gray-900">LoRA Manager</h1>
                    </div>
                    
                    <!-- Desktop navigation -->
                    <div class="hidden md:flex space-x-4">
                        <a href="/" class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">Dashboard</a>
                        <a href="/loras" class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">LoRAs</a>
                        <a href="/recommendations" class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">Recommendations</a>
                        <a href="/compose" class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">Compose</a>
                        <a href="/generate" class="px-3 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">Generate</a>
                    </div>
                </div>
                
                <!-- Right side -->
                <div class="flex items-center space-x-4">
                    <!-- System status -->
                    <div class="hidden md:flex items-center space-x-2 text-sm text-gray-600">
                        <div class="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span>System Online</span>
                    </div>
                    
                    <!-- Mobile menu button -->
                    <button @click="sidebarOpen = !sidebarOpen" class="md:hidden">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Mobile navigation -->
        <div x-show="sidebarOpen" x-cloak class="md:hidden border-t bg-white">
            <div class="px-2 pt-2 pb-3 space-y-1">
                <a href="/" class="block px-3 py-2 text-base font-medium text-gray-700 hover:text-gray-900">Dashboard</a>
                <a href="/loras" class="block px-3 py-2 text-base font-medium text-gray-700 hover:text-gray-900">LoRAs</a>
                <a href="/recommendations" class="block px-3 py-2 text-base font-medium text-gray-700 hover:text-gray-900">Recommendations</a>
                <a href="/compose" class="block px-3 py-2 text-base font-medium text-gray-700 hover:text-gray-900">Compose</a>
                <a href="/generate" class="block px-3 py-2 text-base font-medium text-gray-700 hover:text-gray-900">Generate</a>
            </div>
        </div>
    </nav>
    
    <!-- Main content -->
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {% block content %}{% endblock %}
    </main>
    
    <!-- Toast notifications -->
    <div id="toast-container" class="fixed top-4 right-4 z-50 space-y-2"></div>
    
    <!-- Modal container -->
    <div id="modal-container"></div>
    
    <!-- Loading indicator -->
    <div id="loading" class="htmx-indicator fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 flex items-center space-x-3">
            <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500"></div>
            <span class="text-gray-700">Loading...</span>
        </div>
    </div>
    
    <!-- Custom JavaScript -->
    <script src="{{ url_for('static', path='frontend/static/js/alpine-config.js') }}"></script>
    <script src="{{ url_for('static', path='frontend/static/js/htmx-config.js') }}"></script>
    {% block scripts %}{% endblock %}
</body>
</html>
```

### 3. FastAPI Integration

```python
# app/frontend/__init__.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .routes import router as frontend_router
from .htmx_routes import router as htmx_router

def setup_frontend(app: FastAPI):
    """Set up frontend routes and static files"""
    
    # Mount static files
    app.mount("/static/frontend", StaticFiles(directory="app/frontend/static"), name="frontend_static")
    
    # Include frontend routes
    app.include_router(frontend_router, tags=["frontend"])
    app.include_router(htmx_router, tags=["htmx"])
```

```python
# app/frontend/routes.py
from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse

router = APIRouter()
templates = Jinja2Templates(directory="app/frontend/templates")

@router.get("/", response_class=HTMLResponse)
async def dashboard(request: Request):
    """Main dashboard page"""
    return templates.TemplateResponse("pages/dashboard.html", {
        "request": request,
        "title": "Dashboard"
    })

@router.get("/loras", response_class=HTMLResponse)
async def lora_gallery(request: Request):
    """LoRA collection gallery"""
    return templates.TemplateResponse("pages/loras.html", {
        "request": request,
        "title": "LoRA Collection"
    })

@router.get("/loras/{lora_id}", response_class=HTMLResponse)
async def lora_detail(request: Request, lora_id: str):
    """Individual LoRA details page"""
    return templates.TemplateResponse("pages/lora_detail.html", {
        "request": request,
        "title": "LoRA Details",
        "lora_id": lora_id
    })

@router.get("/recommendations", response_class=HTMLResponse)
async def recommendations(request: Request):
    """AI recommendations page"""
    return templates.TemplateResponse("pages/recommendations.html", {
        "request": request,
        "title": "AI Recommendations"
    })

@router.get("/compose", response_class=HTMLResponse)
async def prompt_composer(request: Request):
    """Prompt composition page"""
    return templates.TemplateResponse("pages/compose.html", {
        "request": request,
        "title": "Prompt Composer"
    })

@router.get("/generate", response_class=HTMLResponse)
async def generation_studio(request: Request):
    """Image generation studio"""
    return templates.TemplateResponse("pages/generate.html", {
        "request": request,
        "title": "Generation Studio"
    })
```

### 4. Update Main Application

```python
# app/main.py - Add frontend integration
from app.frontend import setup_frontend

# Add after existing setup
setup_frontend(app)
```

## 🏗️ Build Process

### 1. Package.json Scripts

```json
{
  "name": "lora-manager-frontend",
  "version": "1.0.0",
  "scripts": {
    "build:css": "tailwindcss -i ./app/frontend/static/css/input.css -o ./app/frontend/static/css/styles.css",
    "watch:css": "tailwindcss -i ./app/frontend/static/css/input.css -o ./app/frontend/static/css/styles.css --watch",
    "build:prod": "tailwindcss -i ./app/frontend/static/css/input.css -o ./app/frontend/static/css/styles.css --minify"
  },
  "devDependencies": {
    "@tailwindcss/forms": "^0.5.7",
    "@tailwindcss/line-clamp": "^0.4.4",
    "@tailwindcss/typography": "^0.5.10",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0"
  }
}
```

### 2. Development Workflow

```bash
# Start CSS watch mode for development
npm run watch:css

# In another terminal, start FastAPI dev server
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Build production CSS
npm run build:prod
```

## 🎯 Implementation Priority

### Phase 1: Core Infrastructure ✅
1. Set up directory structure
2. Configure Tailwind CSS
3. Create base layout template
4. Implement FastAPI integration

### Phase 2: Basic Pages
1. Dashboard page with stats
2. LoRA gallery with search/filter
3. Basic HTMX partials

### Phase 3: AI Features
1. Recommendations interface
2. Similarity explorer
3. Prompt-based recommendations

### Phase 4: Advanced Features
1. Prompt composer
2. Generation monitoring
3. Real-time updates

## 🔧 Development Commands

```bash
# Initialize the frontend
./init_frontend.sh

# Start development
npm run watch:css &
uvicorn app.main:app --reload

# Build for production
npm run build:prod

# Run tests
pytest tests/frontend/
```

## 📱 Next Steps

1. **Run the initialization commands above**
2. **Implement the dashboard page first**
3. **Add LoRA gallery with HTMX**
4. **Integrate AI recommendations**
5. **Build advanced features incrementally**

This quick start guide provides everything needed to begin implementing the frontend. Start with the basic structure and build up the features incrementally, testing each component as you go.
