# Project Structure Migration

This document explains the recent restructuring of the LoRA Manager project to separate frontend and backend code.

## New Directory Structure

```
/home/anxilinux/DeepVault/models/Lora/lora-manager/
├── app/                                # Frontend application (NEW)
│   ├── __init__.py
│   ├── main.py                        # Main FastAPI app integrating frontend + backend
│   └── frontend/                      # Frontend-specific code
│       ├── __init__.py
│       ├── routes.py                  # HTML page routes
│       ├── static/                    # Static assets
│       │   ├── css/
│       │   │   └── styles.css         # Custom Tailwind CSS
│       │   ├── js/
│       │   │   ├── alpine-config.js   # Alpine.js configuration
│       │   │   ├── htmx-config.js     # HTMX configuration
│       │   │   └── components/        # Reusable JS components
│       │   └── images/
│       └── templates/                 # Jinja2 templates
│           ├── base.html              # Base layout template
│           ├── components/            # Reusable components
│           ├── pages/                 # Full page templates
│           └── partials/              # HTMX partial templates
├── backend/                           # Backend API (MOVED from app/)
│   ├── __init__.py
│   ├── main.py                        # Backend FastAPI app
│   ├── api/                           # API routes
│   ├── core/                          # Core backend infrastructure
│   ├── delivery/                      # Delivery backends
│   ├── models/                        # Database models
│   ├── schemas/                       # API schemas
│   ├── services/                      # Business logic
│   └── workers/                       # Background jobs
├── tests/                             # Updated to use backend. imports
├── scripts/                           # Updated to use backend. imports
└── infrastructure/                    # Updated to use backend. imports
```

## Changes Made

### 1. Directory Restructuring
- **Moved** `app/` → `backend/` (contains all existing backend code)
- **Created** new `app/` directory for frontend code
- **Created** `app/frontend/` with complete frontend structure

### 2. Import Path Updates
- All test files: `from app.` → `from backend.`
- Scripts: `from app.` → `from backend.`
- Alembic: `from app.` → `from backend.`

### 3. New Frontend Architecture
- **FastAPI + Jinja2** for server-side rendering
- **HTMX** for dynamic content and real-time updates
- **Alpine.js** for reactive client-side behavior
- **Tailwind CSS** for styling
- **Component-based** template structure

### 4. Application Integration
- **Main app** (`app/main.py`) integrates both frontend and backend
- **Frontend routes** serve HTML pages
- **Backend API** mounted at `/api` endpoint
- **Static files** served from `/static`

## Running the Application

### Development Mode
```bash
# Start the integrated application
cd /home/anxilinux/DeepVault/models/Lora/lora-manager
python -m app.main

# Or with uvicorn directly
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### API Only (Backend)
```bash
# Start only the backend API
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8001
```

## URL Structure

### Frontend Routes (HTML Pages)
- `/` - Dashboard
- `/loras` - LoRA Gallery
- `/loras/{id}` - LoRA Details
- `/recommendations` - AI Recommendations
- `/compose` - Prompt Composer
- `/generate` - Generation Studio
- `/admin` - System Management

### Backend API Routes
- `/api/v1/adapters` - LoRA management
- `/api/v1/recommendations` - AI recommendations
- `/api/v1/generation` - Image generation
- `/api/v1/deliveries` - Job management
- `/api/ws/progress` - WebSocket progress updates

### Static Assets
- `/static/css/` - CSS files
- `/static/js/` - JavaScript files
- `/static/images/` - Images

## Configuration Updates

### Python Path
The project maintains backward compatibility:
- Tests still work with the same pytest configuration
- Alembic migrations work with the new backend path
- Scripts can import from backend module

### Dependencies
No new dependencies were added for the basic structure. The frontend uses CDN links for:
- Tailwind CSS
- HTMX
- Alpine.js

For production, these should be bundled locally.

## Development Workflow

### Backend Development
- Continue developing in `backend/` directory
- All existing patterns and modules remain the same
- API tests remain unchanged

### Frontend Development
- Create pages in `app/frontend/templates/pages/`
- Add routes in `app/frontend/routes.py`
- Style with Tailwind CSS in `app/frontend/static/css/`
- Add interactivity with Alpine.js/HTMX

### Integration
- The main application in `app/main.py` combines both
- Frontend can call backend APIs via HTMX
- Real-time updates via WebSocket integration
- Shared authentication and configuration

## Next Steps

1. **Complete frontend implementation** following the Frontend Plan
2. **Add HTMX endpoints** for dynamic content loading
3. **Implement frontend components** for LoRA management
4. **Add WebSocket integration** for real-time updates
5. **Bundle static assets** for production deployment

This structure provides a clean separation of concerns while maintaining the existing backend functionality and enabling rich frontend development.
