"""
Service Worker Router Module

Handles service worker registration and PWA-related endpoints
for the LoRA Manager frontend application.
"""

import os
import logging
from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, Response
from app.frontend.config import get_settings

logger = logging.getLogger(__name__)

# Create router for service worker routes
router = APIRouter()

# Get configuration
settings = get_settings()


@router.get("/sw.js")
async def service_worker():
    """
    Serve the service worker at the site root (PWA expects /sw.js).
    """
    if not settings.enable_pwa:
        # Return empty service worker if PWA is disabled
        content = """
        // PWA disabled - empty service worker
        self.addEventListener('install', () => {
            console.log('PWA disabled');
        });
        """
        return Response(
            content=content.strip(),
            media_type="application/javascript",
            headers={"Cache-Control": "no-cache"}
        )
    
    sw_path = os.path.join(str(settings.get_static_path()), "sw.js")
    
    if os.path.exists(sw_path):
        return FileResponse(
            sw_path,
            media_type="application/javascript",
            headers={
                "Cache-Control": "no-cache",
                "Service-Worker-Allowed": "/"
            }
        )
    else:
        logger.warning(f"Service worker file not found at {sw_path}")
        # Return minimal service worker to avoid console errors
        content = """
        // Service worker file not found
        self.addEventListener('install', () => {
            console.warn('Service worker file not found');
        });
        """
        return Response(
            content=content.strip(),
            media_type="application/javascript",
            status_code=404,
            headers={"Cache-Control": "no-cache"}
        )


@router.get("/manifest.json")
async def pwa_manifest():
    """
    Serve the PWA manifest file.
    """
    if not settings.enable_pwa:
        return Response(
            content='{"name": "LoRA Manager", "short_name": "LoRA Manager"}',
            media_type="application/json",
            status_code=404
        )
    
    manifest_path = os.path.join(str(settings.get_static_path()), "manifest.json")
    
    if os.path.exists(manifest_path):
        return FileResponse(
            manifest_path,
            media_type="application/json",
            headers={"Cache-Control": f"max-age={settings.static_files_cache_ttl}"}
        )
    else:
        logger.warning(f"PWA manifest file not found at {manifest_path}")
        # Return minimal manifest
        minimal_manifest = {
            "name": "LoRA Manager",
            "short_name": "LoRA Manager",
            "start_url": "/",
            "display": "standalone",
            "background_color": "#ffffff",
            "theme_color": "#000000",
            "icons": []
        }
        
        return Response(
            content=str(minimal_manifest).replace("'", '"'),
            media_type="application/json",
            status_code=404
        )


@router.get("/offline.html")
async def offline_fallback():
    """
    Serve the offline fallback page for PWA.
    """
    offline_path = os.path.join(str(settings.get_template_path()), "pages", "offline.html")
    
    if os.path.exists(offline_path):
        return FileResponse(
            offline_path,
            media_type="text/html",
            headers={"Cache-Control": f"max-age={settings.static_files_cache_ttl}"}
        )
    else:
        # Return minimal offline page
        content = """
        <!DOCTYPE html>
        <html>
        <head>
            <title>Offline - LoRA Manager</title>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body>
            <h1>You're offline</h1>
            <p>Please check your internet connection and try again.</p>
        </body>
        </html>
        """
        return Response(
            content=content.strip(),
            media_type="text/html",
            status_code=200
        )


@router.post("/api/pwa/install")
async def pwa_install_event(request: Request):
    """
    Handle PWA installation events for analytics.
    """
    if not settings.enable_pwa or not settings.enable_analytics:
        return {"status": "disabled"}
    
    try:
        # Log PWA installation attempt
        logger.info("PWA installation event triggered")
        
        # Here you could track analytics, update user preferences, etc.
        
        return {
            "status": "success",
            "message": "PWA installation tracked"
        }
    except Exception as e:
        logger.error(f"Error handling PWA install event: {e}")
        return {
            "status": "error",
            "message": "Failed to track installation"
        }


@router.get("/api/pwa/status")
async def pwa_status():
    """
    Get PWA status and configuration.
    """
    return {
        "enabled": settings.enable_pwa,
        "features": {
            "offline_support": settings.enable_pwa,
            "background_sync": settings.enable_pwa,
            "push_notifications": False,  # Not implemented yet
            "app_shortcuts": settings.enable_pwa
        },
        "settings": {
            "cache_ttl": settings.static_files_cache_ttl,
            "update_check_interval": 60000  # 1 minute
        }
    }


@router.post("/api/pwa/update-check")
async def pwa_update_check():
    """
    Check for PWA updates.
    """
    if not settings.enable_pwa:
        return {"update_available": False, "reason": "PWA disabled"}
    
    # In a real implementation, you would check version numbers,
    # compare timestamps, or use other update detection logic
    
    return {
        "update_available": False,
        "current_version": "1.0.0",
        "latest_version": "1.0.0",
        "last_check": "2025-01-07T00:00:00Z"
    }


@router.get("/favicon.ico")
async def favicon():
    """
    Serve the favicon.
    """
    favicon_path = os.path.join(str(settings.get_static_path()), "favicon.ico")
    
    if os.path.exists(favicon_path):
        return FileResponse(
            favicon_path,
            media_type="image/x-icon",
            headers={"Cache-Control": f"max-age={settings.static_files_cache_ttl}"}
        )
    else:
        # Return 204 No Content if favicon not found
        return Response(status_code=204)


@router.get("/robots.txt")
async def robots_txt():
    """
    Serve robots.txt for SEO.
    """
    robots_path = os.path.join(str(settings.get_static_path()), "robots.txt")
    
    if os.path.exists(robots_path):
        return FileResponse(
            robots_path,
            media_type="text/plain",
            headers={"Cache-Control": f"max-age={settings.static_files_cache_ttl}"}
        )
    else:
        # Return default robots.txt
        content = """
User-agent: *
Disallow: /api/
Disallow: /admin/
Allow: /

Sitemap: /sitemap.xml
        """.strip()
        
        return Response(
            content=content,
            media_type="text/plain",
            headers={"Cache-Control": f"max-age={settings.static_files_cache_ttl}"}
        )


@router.get("/sitemap.xml")
async def sitemap():
    """
    Serve sitemap.xml for SEO.
    """
    # Generate basic sitemap
    base_url = settings.backend_url.replace('/api', '') if '/api' in settings.backend_url else settings.backend_url
    
    urls = [
        "/",
        "/loras",
        "/recommendations", 
        "/compose",
        "/generation-studio",
        "/generation-history",
        "/import-export",
        "/analytics",
        "/help"
    ]
    
    sitemap_content = '<?xml version="1.0" encoding="UTF-8"?>\n'
    sitemap_content += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    
    for url in urls:
        sitemap_content += f'  <url>\n'
        sitemap_content += f'    <loc>{base_url}{url}</loc>\n'
        sitemap_content += f'    <changefreq>weekly</changefreq>\n'
        sitemap_content += f'    <priority>0.8</priority>\n'
        sitemap_content += f'  </url>\n'
    
    sitemap_content += '</urlset>'
    
    return Response(
        content=sitemap_content,
        media_type="application/xml",
        headers={"Cache-Control": f"max-age={settings.static_files_cache_ttl}"}
    )
