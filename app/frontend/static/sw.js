/**
 * LoRA Manager Service Worker
 *
 * The previous implementation manually coordinated multiple cache buckets,
 * custom fetch handlers, and background sync plumbing. It was powerful but
 * difficult to evolve safely as new routes or assets were introduced. This
 * rewrite embraces Workbox so cache names, strategies, and fallbacks live in
 * one place and are easier to update.
 */

/* eslint-disable no-undef */

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

// Disable noisy Workbox logs in production builds.
self.__WB_DISABLE_DEV_LOGS = true;

const SW_VERSION = '2.1.0';
const CACHE_PREFIX = 'lora-manager';

const OFFLINE_PAGE = '/offline';
const STATIC_ASSETS = [
  '/',
  '/loras',
  '/recommendations',
  '/compose',
  '/generate',
  '/admin',
  '/analytics',
  '/import-export',
  '/static/images/logo.svg',
  '/static/manifest.json',
  OFFLINE_PAGE,
];

const PLACEHOLDER_IMAGE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

if (typeof workbox === 'undefined') {
  console.error('[SW] Workbox failed to load. Offline support disabled.');
} else {
  workbox.setConfig({ debug: false });
  workbox.core.setCacheNameDetails({
    prefix: CACHE_PREFIX,
    suffix: SW_VERSION,
    precache: 'precache',
    runtime: 'runtime',
  });

  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  const CACHE_NAMES = {
    precache: workbox.core.cacheNames.precache,
    runtime: workbox.core.cacheNames.runtime,
    pages: `${CACHE_PREFIX}-pages-${SW_VERSION}`,
    api: `${CACHE_PREFIX}-api-${SW_VERSION}`,
    images: `${CACHE_PREFIX}-images-${SW_VERSION}`,
  };

  const precacheManifest = STATIC_ASSETS.map((url) => ({ url, revision: SW_VERSION }));
  workbox.precaching.precacheAndRoute(precacheManifest);
  workbox.precaching.cleanupOutdatedCaches();

  const pageStrategy = new workbox.strategies.NetworkFirst({
    cacheName: CACHE_NAMES.pages,
    networkTimeoutSeconds: 3,
    plugins: [new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [200] })],
  });

  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    async ({ event }) => {
      try {
        return await pageStrategy.handle({ event, request: event.request });
      } catch (error) {
        console.warn('[SW] Falling back to offline page for navigation:', error);
        return (await caches.match(OFFLINE_PAGE)) || createOfflineResponse();
      }
    },
  );

  const apiStrategy = new workbox.strategies.NetworkFirst({
    cacheName: CACHE_NAMES.api,
    networkTimeoutSeconds: 5,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      {
        async handlerDidError({ request }) {
          return createOfflineAPIResponse(new URL(request.url).pathname);
        },
      },
    ],
  });

  workbox.routing.registerRoute(
    ({ url, request }) => url.pathname.startsWith('/api/v1/') && request.method === 'GET',
    ({ event }) => apiStrategy.handle({ event, request: event.request }),
  );

  const staticAssetStrategy = new workbox.strategies.StaleWhileRevalidate({
    cacheName: CACHE_NAMES.runtime,
    plugins: [new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] })],
  });

  workbox.routing.registerRoute(
    ({ request, url }) => {
      if (request.destination && ['script', 'style', 'font'].includes(request.destination)) {
        return true;
      }
      return url.pathname.startsWith('/static/');
    },
    staticAssetStrategy,
  );

  const imageStrategy = new workbox.strategies.CacheFirst({
    cacheName: CACHE_NAMES.images,
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      new workbox.expiration.ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      {
        async handlerDidError() {
          return createPlaceholderImage();
        },
      },
    ],
  });

  workbox.routing.registerRoute(({ request }) => request.destination === 'image', imageStrategy);

  workbox.routing.setCatchHandler(async ({ event }) => {
    const { request } = event;

    if (request.destination === 'document') {
      return (await caches.match(OFFLINE_PAGE)) || createOfflineResponse();
    }

    if (request.destination === 'image') {
      return createPlaceholderImage();
    }

    if (request.url.includes('/api/v1/')) {
      return createOfflineAPIResponse(new URL(request.url).pathname);
    }

    return createOfflineResponse();
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      (async () => {
        const expectedCaches = new Set(Object.values(CACHE_NAMES));
        const cacheKeys = await caches.keys();

        await Promise.all(
          cacheKeys
            .filter((name) => name.startsWith(`${CACHE_PREFIX}-`) && !expectedCaches.has(name))
            .map((name) => caches.delete(name)),
        );
      })(),
    );
  });

  self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync-loras') {
      event.waitUntil(syncQueuedActions(CACHE_NAMES.runtime));
    }
  });

  self.addEventListener('message', (event) => {
    const { type, data } = event.data || {};

    switch (type) {
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;

      case 'QUEUE_ACTION':
        queueAction(data, CACHE_NAMES.runtime);
        break;

      case 'CLEAR_CACHE':
        clearAllCaches();
        break;

      case 'GET_CACHE_STATUS':
        getCacheStatus().then((status) => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage(status);
          }
        });
        break;

      default:
        break;
    }
  });
}

self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/static/images/logo.svg',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  let url = '/';
  if (action === 'view') {
    url = data.url || '/';
  } else if (action === 'dismiss') {
    return;
  }

  event.waitUntil(
    (async () => {
      if (self.clients && typeof self.clients.openWindow === 'function') {
        return self.clients.openWindow(url);
      }
      return Promise.resolve();
    })(),
  );
});

function createOfflineAPIResponse(pathname) {
  let offlineData = {};

  switch (pathname) {
    case '/api/v1/adapters':
      offlineData = {
        loras: [],
        total: 0,
        message: 'Offline - cached data not available',
      };
      break;

    case '/api/v1/recommendations':
      offlineData = {
        recommendations: [],
        message: 'Offline - recommendations require network connection',
      };
      break;

    case '/api/v1/analytics/summary':
      offlineData = {
        metrics: {
          total_loras: 0,
          total_generations: 0,
          cache_hit_rate: 0,
          avg_generation_time: 0,
        },
        message: 'Offline - real-time analytics unavailable',
      };
      break;

    case '/api/v1/system/status':
      offlineData = {
        status: 'offline',
        workers: [],
        gpu_usage: 0,
        memory_usage: 0,
        message: 'System monitoring requires network connection',
      };
      break;

    default:
      offlineData = {
        error: 'Offline',
        message: 'This feature requires an internet connection',
      };
  }

  return new Response(JSON.stringify(offlineData), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Offline': 'true',
    },
  });
}

function createPlaceholderImage() {
  const bytes = Uint8Array.from(atob(PLACEHOLDER_IMAGE), (char) => char.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'X-Offline': 'true',
    },
  });
}

function createOfflineResponse() {
  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/plain',
      'X-Offline': 'true',
    },
  });
}

async function queueAction(action, runtimeCacheName = 'runtime') {
  if (!action) {
    return;
  }

  try {
    const cache = await caches.open(runtimeCacheName);
    const existingActions = await cache.match('queued-actions');

    let actions = [];
    if (existingActions) {
      actions = await existingActions.json();
    }

    actions.push({
      ...action,
      timestamp: Date.now(),
    });

    await cache.put('queued-actions', new Response(JSON.stringify(actions)));

    if ('sync' in self.registration) {
      await self.registration.sync.register('background-sync-loras');
    }
  } catch (error) {
    console.error('[SW] Failed to queue action:', error);
  }
}

async function syncQueuedActions(runtimeCacheName = 'runtime') {
  try {
    const cache = await caches.open(runtimeCacheName);
    const queuedActions = await cache.match('queued-actions');

    if (!queuedActions) {
      return;
    }

    const actions = await queuedActions.json();

    for (const action of actions) {
      try {
        await fetch(action.url, action.options);
        console.log('[SW] Synced queued action:', action.url);
      } catch (error) {
        console.error('[SW] Failed to sync action:', action.url, error);
      }
    }

    await cache.delete('queued-actions');
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

async function clearAllCaches() {
  const cacheNames = await caches.keys();
  await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
}

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

