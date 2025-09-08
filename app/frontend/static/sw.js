/**
 * LoRA Manager Service Worker
 * Provides offline functionality, caching, and background sync
 */

const CACHE_NAME = 'lora-manager-v2.1.0';
const STATIC_CACHE = 'lora-manager-static-v2.1.0';
const DYNAMIC_CACHE = 'lora-manager-dynamic-v2.1.0';
const IMAGES_CACHE = 'lora-manager-images-v2.1.0';

// Files to cache for offline use
const STATIC_ASSETS = [
    '/',
    '/loras',
    '/recommendations', 
    '/compose',
    '/generate',
    '/admin',
    '/analytics',
    '/import-export',
    
    // CSS files
    '/static/css/styles.css',
    '/static/css/components.css',
    '/static/css/mobile.css',
    
    // JavaScript files
    '/static/js/common.js',
    '/static/js/alpine-config.js',
    '/static/js/htmx-config.js',
    '/static/js/mobile-nav.js',
    '/static/js/components/system-admin.js',
    '/static/js/components/performance-analytics.js',
    '/static/js/components/import-export.js',
    
    // External libraries (CDN fallbacks)
    'https://cdn.tailwindcss.com',
    'https://unpkg.com/htmx.org@1.9.6',
    'https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    
    // Images and icons (use svg logo as single icon)
    '/static/images/logo.svg',
    '/static/manifest.json'
];

// API endpoints that should work offline with cached data
const OFFLINE_API_ENDPOINTS = [
    '/api/v1/loras',
    '/api/v1/recommendations',
    '/api/v1/analytics/summary',
    '/api/v1/system/status'
];

// Network-first strategies for these patterns
const NETWORK_FIRST_PATTERNS = [
    /\/api\/v1\/generation\//,
    /\/api\/v1\/workers\//,
    /\/api\/v1\/system\/real-time/
];

// Cache-first strategies for these patterns  
const CACHE_FIRST_PATTERNS = [
    /\.(?:js|css|png|jpg|jpeg|svg|gif|woff2?|ttf|eot)$/,
    /\/static\//
];

self.addEventListener('install', (event) => {
    console.log('[SW] Installing Service Worker');
    
    event.waitUntil(
        Promise.all([
            // Cache static assets
            caches.open(STATIC_CACHE).then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            }),
            
            // Cache offline page
            caches.open(DYNAMIC_CACHE).then((cache) => {
                return cache.add('/offline');
            })
        ]).then(() => {
            console.log('[SW] Installation complete');
            return self.skipWaiting();
        }).catch((error) => {
            console.error('[SW] Installation failed:', error);
        })
    );
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating Service Worker');
    
    event.waitUntil(
        Promise.all([
            // Clean up old caches
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE && 
                            cacheName !== DYNAMIC_CACHE && 
                            cacheName !== IMAGES_CACHE) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            
            // Take control of all pages
            self.clients.claim()
        ]).then(() => {
            console.log('[SW] Activation complete');
        })
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests and chrome-extension requests
    if (request.method !== 'GET' || url.protocol === 'chrome-extension:') {
        return;
    }
    
    // Handle different types of requests
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(handleAPIRequest(request));
    } else if (url.pathname.startsWith('/static/images/')) {
        event.respondWith(handleImageRequest(request));
    } else if (isCacheFirstResource(request)) {
        event.respondWith(handleCacheFirst(request));
    } else if (isNetworkFirstResource(request)) {
        event.respondWith(handleNetworkFirst(request));
    } else {
        event.respondWith(handlePageRequest(request));
    }
});

/**
 * Handle API requests with network-first strategy and offline fallback
 */
async function handleAPIRequest(request) {
    const url = new URL(request.url);
    
    try {
        // Try network first
        const response = await fetch(request);
        
        // Cache successful responses
        if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        // Network failed, try cache
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
            console.log('[SW] Serving API from cache:', url.pathname);
            return cachedResponse;
        }
        
        // Return offline API response
        return createOfflineAPIResponse(url.pathname);
    }
}

/**
 * Handle image requests with cache-first strategy
 */
async function handleImageRequest(request) {
    const cache = await caches.open(IMAGES_CACHE);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const response = await fetch(request);
        if (response.ok) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // Return placeholder image for offline
        return createPlaceholderImage();
    }
}

/**
 * Handle cache-first resources (CSS, JS, fonts, etc.)
 */
async function handleCacheFirst(request) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.error('[SW] Failed to fetch cache-first resource:', request.url);
        throw error;
    }
}

/**
 * Handle network-first resources (real-time data, etc.)
 */
async function handleNetworkFirst(request) {
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        const cachedResponse = await caches.match(request);
        return cachedResponse || createOfflineResponse();
    }
}

/**
 * Handle page requests with stale-while-revalidate strategy
 */
async function handlePageRequest(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    const cachedResponse = await cache.match(request);
    
    // Return cached version immediately if available
    if (cachedResponse) {
        // Update cache in background
        fetch(request).then((response) => {
            if (response.ok) {
                cache.put(request, response.clone());
            }
        }).catch(() => {
            // Ignore network errors for background updates
        });
        
        return cachedResponse;
    }
    
    // No cache, try network
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        // Network failed and no cache, return offline page
        return caches.match('/offline') || createOfflineResponse();
    }
}

/**
 * Check if resource should use cache-first strategy
 */
function isCacheFirstResource(request) {
    return CACHE_FIRST_PATTERNS.some(pattern => pattern.test(request.url));
}

/**
 * Check if resource should use network-first strategy
 */
function isNetworkFirstResource(request) {
    return NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(request.url));
}

/**
 * Create offline API response with cached or default data
 */
function createOfflineAPIResponse(pathname) {
    let offlineData = {};
    
    switch (pathname) {
        case '/api/v1/loras':
            offlineData = {
                loras: [],
                total: 0,
                message: 'Offline - cached data not available'
            };
            break;
            
        case '/api/v1/recommendations':
            offlineData = {
                recommendations: [],
                message: 'Offline - recommendations require network connection'
            };
            break;
            
        case '/api/v1/analytics/summary':
            offlineData = {
                metrics: {
                    total_loras: 0,
                    total_generations: 0,
                    cache_hit_rate: 0,
                    avg_generation_time: 0
                },
                message: 'Offline - real-time analytics unavailable'
            };
            break;
            
        case '/api/v1/system/status':
            offlineData = {
                status: 'offline',
                workers: [],
                gpu_usage: 0,
                memory_usage: 0,
                message: 'System monitoring requires network connection'
            };
            break;
            
        default:
            offlineData = {
                error: 'Offline',
                message: 'This feature requires an internet connection'
            };
    }
    
    return new Response(JSON.stringify(offlineData), {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'X-Offline': 'true'
        }
    });
}

/**
 * Create placeholder image for offline use
 */
function createPlaceholderImage() {
    // Simple 1x1 transparent PNG
    const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(imageData), c => c.charCodeAt(0));
    
    return new Response(bytes, {
        status: 200,
        headers: {
            'Content-Type': 'image/png',
            'X-Offline': 'true'
        }
    });
}

/**
 * Create generic offline response
 */
function createOfflineResponse() {
    return new Response('Offline', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: {
            'Content-Type': 'text/plain',
            'X-Offline': 'true'
        }
    });
}

// Handle background sync for queued actions
self.addEventListener('sync', (event) => {
    console.log('[SW] Background sync triggered:', event.tag);
    
    if (event.tag === 'background-sync-loras') {
        event.waitUntil(syncQueuedActions());
    }
});

/**
 * Sync queued actions when connection is restored
 */
async function syncQueuedActions() {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const queuedActions = await cache.match('queued-actions');
        
        if (queuedActions) {
            const actions = await queuedActions.json();
            
            for (const action of actions) {
                try {
                    await fetch(action.url, action.options);
                    console.log('[SW] Synced queued action:', action.url);
                } catch (error) {
                    console.error('[SW] Failed to sync action:', action.url, error);
                }
            }
            
            // Clear synced actions
            await cache.delete('queued-actions');
        }
    } catch (error) {
        console.error('[SW] Background sync failed:', error);
    }
}

// Handle push notifications
self.addEventListener('push', (event) => {
    if (!event.data) return;
    
    const data = event.data.json();
    const options = {
        body: data.body,
        icon: '/static/images/logo.svg',
        // badge left undefined to avoid missing badge PNG
        vibrate: [100, 50, 100],
        data: data.data || {},
        actions: data.actions || []
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    const action = event.action;
    const data = event.notification.data;
    
    let url = '/';
    
    if (action === 'view') {
        url = data.url || '/';
    } else if (action === 'dismiss') {
        return;
    }
    
    // Use the service worker scoped `self.clients` and guard against missing API
    event.waitUntil(
        (async () => {
            if (self.clients && typeof self.clients.openWindow === 'function') {
                return self.clients.openWindow(url);
            }
            // Fallback: resolve immediately if openWindow isn't available
            return Promise.resolve();
        })()
    );
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'QUEUE_ACTION':
            queueAction(data);
            break;
            
        case 'CLEAR_CACHE':
            clearAllCaches();
            break;
            
        case 'GET_CACHE_STATUS':
            getCacheStatus().then(status => {
                event.ports[0].postMessage(status);
            });
            break;
    }
});

/**
 * Queue action for background sync
 */
async function queueAction(action) {
    try {
        const cache = await caches.open(DYNAMIC_CACHE);
        const existingActions = await cache.match('queued-actions');
        
        let actions = [];
        if (existingActions) {
            actions = await existingActions.json();
        }
        
        actions.push({
            ...action,
            timestamp: Date.now()
        });
        
        await cache.put('queued-actions', new Response(JSON.stringify(actions)));
        
        // Register for background sync
        if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
            await self.registration.sync.register('background-sync-loras');
        }
    } catch (error) {
        console.error('[SW] Failed to queue action:', error);
    }
}

/**
 * Clear all caches
 */
async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
    );
}

/**
 * Get cache status information
 */
async function getCacheStatus() {
    const cacheNames = await caches.keys();
    const status = {};
    
    for (const cacheName of cacheNames) {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        status[cacheName] = keys.length;
    }
    
    return status;
}
