# LoRA Manager Frontend Architecture Plan

## Overview

This document outlines a comprehensive frontend implementation plan for the LoRA Manager using a modern, lightweight tech stack that builds upon the existing FastAPI backend. The frontend will provide an intuitive, responsive interface for managing LoRA adapters with AI-powered recommendations.

## 🎯 Technology Stack

### Core Technologies
- **FastAPI**: Backend API (already implemented) + Frontend routing
- **HTMX**: Dynamic HTML exchanges and real-time updates
- **Alpine.js**: Reactive client-side behavior and state management
- **Tailwind CSS**: Utility-first styling framework
- **Jinja2**: Server-side templating engine

### Why This Stack?

1. **FastAPI Integration**: Seamless integration with existing backend
2. **HTMX**: Enables dynamic content without complex JavaScript frameworks
3. **Alpine.js**: Lightweight reactivity for component-level interactions
4. **Tailwind CSS**: Rapid UI development with consistent design system
5. **Jinja2**: Native FastAPI template support with powerful templating features

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI Application                      │
├─────────────────────────────────────────────────────────────┤
│  Frontend Routes (app/frontend/)                           │
│  ├── HTML Templates (Jinja2)                              │
│  ├── Static Assets (CSS, JS, Images)                      │
│  └── Frontend API Endpoints                               │
├─────────────────────────────────────────────────────────────┤
│  Backend API (app/api/v1/) - EXISTING                     │
│  ├── Adapters Management                                  │
│  ├── Recommendations (AI-powered)                         │
│  ├── Generation & Delivery                                │
│  └── WebSocket Real-time Updates                          │
└─────────────────────────────────────────────────────────────┘
```

## 📱 Application Structure

### Page Architecture
```
app/
├── frontend/                    # Frontend-specific code
│   ├── __init__.py
│   ├── routes.py               # HTML page routes
│   ├── static/                 # Static assets
│   │   ├── css/
│   │   │   └── styles.css      # Custom Tailwind CSS
│   │   ├── js/
│   │   │   ├── alpine-config.js # Alpine.js configuration
│   │   │   ├── htmx-config.js   # HTMX configuration
│   │   │   └── components/      # Reusable JS components
│   │   └── images/
│   └── templates/              # Jinja2 templates
│       ├── base.html           # Base layout template
│       ├── components/         # Reusable components
│       ├── pages/              # Full page templates
│       └── partials/           # HTMX partial templates
├── api/                        # Existing API (unchanged)
└── ...                         # Other existing modules
```

## 🎨 User Interface Design

### Core Pages

#### 1. Dashboard (`/`)
- **Purpose**: Main landing page with overview and quick actions
- **Features**:
  - LoRA collection statistics
  - Recent activity feed
  - Quick access to recommendations
  - System health indicators (GPU status, embeddings coverage)
  - Featured/popular LoRAs

#### 2. LoRA Gallery (`/loras`)
- **Purpose**: Browse and manage LoRA collection
- **Features**:
  - Grid/list view toggle
  - Advanced filtering (tags, active status, quality score)
  - Search with real-time results
  - Bulk actions (activate/deactivate, delete)
  - Inline editing capabilities


#### 3. LoRA Details (`/loras/{id}`)
- **Purpose**: Detailed view and management of individual LoRA
- **Features**:
  - Full metadata display and editing
  - AI-powered recommendations ("More Like This")
  - Preview generation
  - Usage statistics
  - Embedding status and quality metrics
  - File management (download, replace)

#### 4. AI Recommendations (`/recommendations`)
- **Purpose**: AI-powered LoRA discovery and recommendations
- **Features**:
  - Prompt-based recommendations
  - Similarity exploration
  - Recommendation tuning (weights, thresholds)
  - Batch embedding computation
  - System performance metrics

#### 5. Prompt Composer (`/compose`)
- **Purpose**: Interactive prompt building with LoRA integration
- **Features**:
  - Drag-and-drop LoRA ordering
  - Real-time prompt preview
  - Weight adjustment sliders
  - Delivery mode selection
  - Generation queue management

#### 6. Generation Studio (`/generate`)
- **Purpose**: Image generation with LoRA integration
- **Features**:
  - Parameter configuration
  - Real-time progress monitoring
  - Generation history
  - Batch generation queue
  - Result gallery and management

#### 7. System Management (`/admin`)
- **Purpose**: System administration and monitoring
- **Features**:
  - Import/export tools
  - Database management
  - Worker status monitoring
  - Performance analytics
  - Configuration management

## 🔧 Technical Implementation

### 1. FastAPI Frontend Integration

```python
# app/frontend/routes.py
from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles

router = APIRouter()
templates = Jinja2Templates(directory="app/frontend/templates")

@router.get("/")
async def dashboard(request: Request):
    """Main dashboard with overview statistics"""
    return templates.TemplateResponse("pages/dashboard.html", {
        "request": request,
        "title": "LoRA Manager Dashboard"
    })

@router.get("/loras")
async def lora_gallery(request: Request):
    """LoRA collection gallery"""
    return templates.TemplateResponse("pages/loras.html", {
        "request": request,
        "title": "LoRA Collection"
    })
```

### 2. HTMX Integration Patterns

#### Dynamic Content Loading
```html
<!-- Load LoRA cards dynamically -->
<div id="lora-grid" 
     hx-get="/api/htmx/loras/grid" 
     hx-trigger="load, search-changed from:body"
     hx-indicator="#loading">
    <!-- LoRA cards will be loaded here -->
</div>
```

#### Real-time Updates
```html
<!-- Real-time generation progress -->
<div hx-get="/api/htmx/generation/progress/{job_id}"
     hx-trigger="every 1s"
     hx-swap="innerHTML">
    <!-- Progress bar and status updates -->
</div>
```

#### Form Submissions
```html
<!-- LoRA metadata editing -->
<form hx-patch="/api/v1/adapters/{id}"
      hx-target="#lora-details"
      hx-swap="outerHTML">
    <!-- Form fields -->
</form>
```

### 3. Alpine.js Component Architecture

#### LoRA Card Component
```html
<div x-data="loraCard({ id: '{lora_id}', active: {active} })"
     class="bg-white rounded-lg shadow-md p-4">
    
    <!-- Activation toggle -->
    <button @click="toggleActive()" 
            :class="active ? 'bg-green-500' : 'bg-gray-300'"
            class="px-3 py-1 rounded">
        <span x-text="active ? 'Active' : 'Inactive'"></span>
    </button>
    
    <!-- Weight slider -->
    <input type="range" 
           x-model="weight" 
           @input="updateWeight()"
           min="0" max="2" step="0.1"
           class="w-full">
    
    <!-- Quick actions -->
    <div class="flex space-x-2 mt-3">
        <button @click="getRecommendations()" 
                class="btn-secondary">
            Similar LoRAs
        </button>
        <button @click="generatePreview()" 
                class="btn-primary">
            Generate Preview
        </button>
    </div>
</div>
```

#### Search and Filter Component
```html
<div x-data="searchFilter()" class="mb-6">
    <!-- Search input -->
    <input x-model="searchTerm" 
           @input.debounce.300ms="search()"
           placeholder="Search LoRAs..."
           class="w-full px-4 py-2 border rounded-lg">
    
    <!-- Filter toggles -->
    <div class="flex space-x-4 mt-3">
        <label class="flex items-center">
            <input type="checkbox" 
                   x-model="filters.activeOnly" 
                   @change="applyFilters()">
            <span class="ml-2">Active Only</span>
        </label>
        
        <!-- Tag filters -->
        <template x-for="tag in availableTags" :key="tag">
            <label class="flex items-center">
                <input type="checkbox" 
                       :value="tag"
                       x-model="filters.tags"
                       @change="applyFilters()">
                <span x-text="tag" class="ml-2"></span>
            </label>
        </template>
    </div>
</div>
```

### 4. Tailwind CSS Design System

#### Color Palette
```css
/* app/frontend/static/css/styles.css */
:root {
  /* Primary colors */
  --primary-50: #eff6ff;
  --primary-500: #3b82f6;
  --primary-600: #2563eb;
  --primary-700: #1d4ed8;
  
  /* Accent colors */
  --accent-500: #10b981;
  --accent-600: #059669;
  
  /* Status colors */
  --success-500: #10b981;
  --warning-500: #f59e0b;
  --error-500: #ef4444;
}
```

#### Component Classes
```css
/* Custom component styles */
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
  @apply w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500;
}
```

## 🚀 Feature Implementation Details

### 1. AI Recommendations Interface

#### Similarity Explorer
```html
<!-- Similar LoRAs discovery -->
<div x-data="similarityExplorer()" class="space-y-6">
    <!-- Target LoRA selection -->
    <div class="card">
        <h3 class="text-lg font-semibold mb-4">Find Similar LoRAs</h3>
        <select x-model="targetLoraId" 
                @change="findSimilar()"
                class="form-input">
            <option value="">Select a LoRA...</option>
            <template x-for="lora in availableLoras" :key="lora.id">
                <option :value="lora.id" x-text="lora.name"></option>
            </template>
        </select>
    </div>
    
    <!-- Similarity controls -->
    <div class="card">
        <h4 class="font-medium mb-3">Similarity Settings</h4>
        <div class="grid grid-cols-3 gap-4">
            <div>
                <label class="block text-sm font-medium mb-1">Semantic Weight</label>
                <input type="range" x-model="weights.semantic" 
                       min="0" max="1" step="0.1" class="w-full">
                <span x-text="weights.semantic" class="text-sm text-gray-600"></span>
            </div>
            <div>
                <label class="block text-sm font-medium mb-1">Artistic Weight</label>
                <input type="range" x-model="weights.artistic" 
                       min="0" max="1" step="0.1" class="w-full">
                <span x-text="weights.artistic" class="text-sm text-gray-600"></span>
            </div>
            <div>
                <label class="block text-sm font-medium mb-1">Technical Weight</label>
                <input type="range" x-model="weights.technical" 
                       min="0" max="1" step="0.1" class="w-full">
                <span x-text="weights.technical" class="text-sm text-gray-600"></span>
            </div>
        </div>
    </div>
    
    <!-- Results -->
    <div hx-get="/api/htmx/recommendations/similar"
         hx-trigger="similarity-search from:body"
         hx-vals="js:{target_id: targetLoraId, weights: weights}"
         class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Recommendation cards will be loaded here -->
    </div>
</div>
```

#### Prompt-Based Recommendations
```html
<!-- Prompt-based LoRA discovery -->
<div x-data="promptRecommendations()" class="space-y-6">
    <div class="card">
        <h3 class="text-lg font-semibold mb-4">Prompt-Based Recommendations</h3>
        
        <!-- Prompt input -->
        <textarea x-model="prompt" 
                  @input.debounce.500ms="getRecommendations()"
                  placeholder="Enter your prompt (e.g., 'anime girl with pink hair')"
                  class="form-input h-24 resize-none"></textarea>
        
        <!-- Quick prompt suggestions -->
        <div class="flex flex-wrap gap-2 mt-3">
            <template x-for="suggestion in promptSuggestions" :key="suggestion">
                <button @click="prompt = suggestion; getRecommendations()" 
                        class="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm">
                    <span x-text="suggestion"></span>
                </button>
            </template>
        </div>
    </div>
    
    <!-- Recommendations grid -->
    <div hx-get="/api/htmx/recommendations/prompt"
         hx-trigger="prompt-search from:body"
         hx-vals="js:{prompt: prompt}"
         class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <!-- Recommendation cards will be loaded here -->
    </div>
</div>
```

### 2. Real-time Generation Monitoring

#### WebSocket Integration with Alpine.js
```html
<div x-data="generationMonitor()" x-init="connectWebSocket()">
    <!-- Generation queue -->
    <div class="card">
        <h3 class="text-lg font-semibold mb-4">Generation Queue</h3>
        <template x-for="job in activeJobs" :key="job.id">
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded mb-2">
                <div>
                    <div class="font-medium" x-text="job.prompt"></div>
                    <div class="text-sm text-gray-600" x-text="job.status"></div>
                </div>
                <div class="w-32">
                    <div class="bg-gray-200 rounded-full h-2">
                        <div class="bg-primary-500 h-2 rounded-full transition-all"
                             :style="`width: ${job.progress}%`"></div>
                    </div>
                    <div class="text-xs text-center mt-1" x-text="`${job.progress}%`"></div>
                </div>
            </div>
        </template>
    </div>
</div>
```

### 3. Drag-and-Drop Prompt Composer

```html
<div x-data="promptComposer()" class="space-y-6">
    <!-- Active LoRAs (draggable) -->
    <div class="card">
        <h3 class="text-lg font-semibold mb-4">Active LoRAs</h3>
        <div x-sort="activeLoras" class="space-y-2">
            <template x-for="lora in activeLoras" :key="lora.id">
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded cursor-move"
                     x-sort:item="lora">
                    <div class="flex items-center space-x-3">
                        <div class="w-2 h-6 bg-gray-400 rounded"></div>
                        <span x-text="lora.name" class="font-medium"></span>
                    </div>
                    <div class="flex items-center space-x-3">
                        <input type="range" 
                               x-model="lora.weight" 
                               @input="updatePrompt()"
                               min="0" max="2" step="0.1" 
                               class="w-20">
                        <span x-text="lora.weight" class="text-sm w-8"></span>
                        <button @click="removeLora(lora.id)" 
                                class="text-red-500 hover:text-red-700">
                            ×
                        </button>
                    </div>
                </div>
            </template>
        </div>
    </div>
    
    <!-- Prompt preview -->
    <div class="card">
        <h3 class="text-lg font-semibold mb-4">Generated Prompt</h3>
        <textarea x-model="generatedPrompt" 
                  readonly
                  class="form-input h-24 bg-gray-50 font-mono text-sm"></textarea>
        
        <!-- Quick actions -->
        <div class="flex space-x-3 mt-4">
            <button @click="copyPrompt()" class="btn-secondary">
                Copy Prompt
            </button>
            <button @click="generateImage()" class="btn-primary">
                Generate Image
            </button>
            <button @click="saveComposition()" class="btn-secondary">
                Save Composition
            </button>
        </div>
    </div>
</div>
```

## 📊 Data Flow and State Management

### Alpine.js Store Pattern
```javascript
// app/frontend/static/js/alpine-config.js
document.addEventListener('alpine:init', () => {
    Alpine.store('app', {
        // Global state
        user: null,
        loras: [],
        activeJobs: [],
        systemStats: {},
        
        // Actions
        async loadLoras() {
            const response = await fetch('/api/v1/adapters');
            this.loras = await response.json();
        },
        
        async toggleLoraActive(loraId) {
            const lora = this.loras.find(l => l.id === loraId);
            const endpoint = lora.active ? 'deactivate' : 'activate';
            
            await fetch(`/api/v1/adapters/${loraId}/${endpoint}`, {
                method: 'POST'
            });
            
            lora.active = !lora.active;
        },
        
        async getRecommendations(loraId) {
            const response = await fetch(`/api/v1/recommendations/similar/${loraId}`);
            return await response.json();
        }
    });
});
```

### HTMX Event System
```javascript
// Custom HTMX events for coordination
document.body.addEventListener('htmx:afterRequest', (event) => {
    if (event.detail.xhr.status === 200) {
        // Trigger Alpine.js updates
        Alpine.store('app').loadLoras();
    }
});

// Custom events for component communication
function triggerSearch() {
    document.body.dispatchEvent(new CustomEvent('search-changed'));
}

function triggerSimilaritySearch(targetId, weights) {
    document.body.dispatchEvent(new CustomEvent('similarity-search', {
        detail: { targetId, weights }
    }));
}
```

## 🎯 Performance Optimization

### 1. Lazy Loading
- Progressive image loading for LoRA previews
- Infinite scroll for large collections
- Component-level loading states

### 2. Caching Strategy
- Browser cache for static assets
- API response caching with ETags
- Alpine.js store persistence

### 3. Network Optimization
- HTMX request deduplication
- Debounced search inputs
- Optimistic UI updates

## 🔒 Security Considerations

### 1. Client-Side Security
- Input sanitization in templates
- CSRF protection for forms
- Secure API key handling

### 2. Server-Side Security
- Template injection prevention
- File upload validation
- Rate limiting for API endpoints

## 🧪 Testing Strategy

### 1. Unit Testing
- Alpine.js component testing
- HTMX interaction testing
- Template rendering tests

### 2. Integration Testing
- End-to-end user workflows
- API integration testing
- Real-time feature testing

### 3. Performance Testing
- Page load time optimization
- WebSocket connection testing
- Large dataset handling

## 📈 Deployment Strategy

### 1. Development Environment
```bash
# Install frontend dependencies
npm install -D tailwindcss @tailwindcss/forms @tailwindcss/typography
npm install htmx.org alpinejs

# Build CSS
npx tailwindcss -i ./app/frontend/static/css/input.css -o ./app/frontend/static/css/styles.css --watch
```

### 2. Production Build
- CSS minification and purging
- JavaScript bundling and compression
- Static asset optimization

### 3. Docker Integration
```dockerfile
# Add to existing Dockerfile
COPY app/frontend/static /app/frontend/static
COPY app/frontend/templates /app/frontend/templates

# Build production assets
RUN npm run build:css
```

## 🚀 Implementation Roadmap

### Phase 1: Core Infrastructure ✅ **COMPLETED**
- [x] FastAPI frontend routing setup
- [x] Base templates and layout
- [x] Tailwind CSS configuration
- [x] Alpine.js and HTMX integration

### Phase 2: LoRA Management ✅ **COMPLETED**
- [x] LoRA gallery and details pages
- [x] Search and filtering functionality
- [x] Inline editing capabilities
- [x] Bulk operations interface

### Phase 3: AI Recommendations ✅ **COMPLETED**
- [x] Similarity explorer interface
- [x] Prompt-based recommendations
- [x] Recommendation tuning controls
- [x] Embedding status monitoring

### Phase 4: Generation Studio (Week 4) 🚧 **NEXT PRIORITY**
- [ ] Prompt composer with drag-and-drop
- [ ] Real-time generation monitoring
- [ ] Generation history and gallery
- [ ] Batch operation management

### Phase 5: Advanced Features (Week 5)
- [ ] System administration interface
- [ ] Performance analytics dashboard
- [ ] Import/export workflows
- [ ] Mobile responsiveness optimization

### Phase 6: Polish and Testing (Week 6)
- [ ] Comprehensive testing suite
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] Documentation completion

## 🎉 Current Status (September 3, 2025)

### ✅ Successfully Implemented Features:

#### **Core Infrastructure (Phase 1)**
- **FastAPI Frontend Integration**: Seamless routing between frontend and backend
- **Modern Template System**: Jinja2 templates with component-based architecture
- **Responsive Design**: Tailwind CSS with custom design system
- **Interactive Components**: Alpine.js for reactive behavior and HTMX for dynamic updates

#### **LoRA Management (Phase 2)**
- **Comprehensive Dashboard**: Statistics, activity feed, featured LoRAs, and system health
- **Advanced Gallery**: Grid/list views with real-time search and filtering
- **Bulk Operations**: Multi-select interface for batch activate/deactivate/delete
- **Enhanced API**: Updated backend endpoints with pagination, search, and filtering
- **Dynamic Loading**: HTMX-powered partial templates for smooth UX

#### **AI Recommendations (Phase 3)**
- **Comprehensive Recommendations UI**: Three-tab interface for Similarity, Prompt, and Status
- **Similarity Explorer**: Find similar LoRAs with adjustable weights
- **Prompt-Based Search**: Get recommendations based on natural language prompts
- **Embedding Status Dashboard**: Real-time monitoring of embedding and GPU status

#### **Technical Achievements**
- **Project Restructure**: Clean separation between frontend (`app/`) and backend (`backend/`)
- **Component Architecture**: Reusable LoRA card and UI component macros
- **Framework Correction**: Migrated from incorrect Flask-in-FastAPI to pure FastAPI routes
- **Code Refactoring**: Reduced template complexity by 33% and centralized JavaScript logic
- **API Enhancement**: Extended `/api/v1/adapters` with comprehensive filtering and sorting

### 🏃‍♂️ **Application Status**
- **Live and Running**: http://localhost:8000
- **Dashboard**: Fully functional with live statistics and quick actions
- **LoRA Gallery**: Complete with advanced search, filtering, and bulk management
- **AI Recommendations**: Fully implemented with three distinct modes of discovery
- **Performance**: Fast, responsive interface with optimized API calls

## 📝 Next Steps

### 🎯 **Immediate Next Phase: Generation Studio (Phase 4)**

1. **Implement Prompt Composer**
   - Create a drag-and-drop interface for ordering LoRAs in a prompt
   - Add real-time weight adjustment sliders for each LoRA
   - Develop a "composition" data model to save and load prompt setups

2. **Build Generation Interface**
   - Integrate with the backend generation endpoint (`/api/v1/generation`)
   - Create a form for generation parameters (steps, CFG, seed, etc.)
   - Implement a real-time progress monitor using WebSockets or HTMX polling

3. **Develop Generation History & Gallery**
   - Create a page to view past generations
   - Add features to save, delete, and re-use generation parameters
   - Implement a gallery view for generated images

4. **Manage Batch Operations**
   - Build an interface to queue multiple generation jobs
   - Display and manage the generation queue (pause, cancel, reorder)

### 🔮 **Future Development Priorities**

- **Advanced Administration**: System management interface with analytics
- **Mobile Optimization**: Enhanced responsive design for mobile workflows
- **Performance & UX Improvements**: Caching, loading states, and progress indicators

### 💡 **Recommended Implementation Order**

1. **Start with the Prompt Composer** - This is the core of the Generation Studio
2. **Build the basic Generation Interface** - Allow users to generate single images
3. **Add Generation History** - Provide a way for users to track their work
4. **Implement Batch Operations** - Enhance productivity with queue management

This frontend plan provides a comprehensive, modern web interface that fully leverages the existing FastAPI backend while delivering an exceptional user experience for LoRA management and AI-powered recommendations.
