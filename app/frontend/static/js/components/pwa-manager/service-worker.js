/**
 * PWA Manager - Service Worker Module
 * 
 * Handles service worker registration, lifecycle management, and updates.
 */

/**
 * Service Worker management operations
 */
const pwaServiceWorker = {
    /**
     * Registers the service worker
     */
    async register(swPath = '/sw.js', scope = '/') {
        if (!('serviceWorker' in navigator)) {
            throw new Error('Service Worker not supported');
        }
        
        try {
            const registration = await navigator.serviceWorker.register(swPath, { scope });
            
            if (window.DevLogger?.debug) {
                window.DevLogger.debug('[PWA] Service Worker registered:', registration);
            }
            
            return registration;
            
        } catch (error) {
            if (window.DevLogger?.debug) {
                window.DevLogger.debug('[PWA] Service Worker registration failed:', error);
            }
            throw new Error(`Service Worker registration failed: ${error.message}`);
        }
    },
    
    /**
     * Sets up service worker event listeners
     */
    setupEventListeners(registration, callbacks = {}) {
        if (!registration) return () => {};
        
        // Handle updates
        const handleUpdateFound = () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            
            const handleStateChange = () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    if (callbacks.onUpdateAvailable) {
                        callbacks.onUpdateAvailable(newWorker);
                    }
                }
            };
            
            newWorker.addEventListener('statechange', handleStateChange);
        };
        
        // Handle controller changes
        const handleControllerChange = () => {
            if (callbacks.onControllerChange) {
                callbacks.onControllerChange();
            } else {
                window.location.reload();
            }
        };
        
        registration.addEventListener('updatefound', handleUpdateFound);
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
        
        // Return cleanup function
        return () => {
            registration.removeEventListener('updatefound', handleUpdateFound);
            navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
        };
    },
    
    /**
     * Checks for service worker updates
     */
    async checkForUpdates(registration) {
        if (!registration) return false;
        
        try {
            await registration.update();
            return true;
        } catch (error) {
            if (window.DevLogger?.debug) {
                window.DevLogger.debug('[PWA] Update check failed:', error);
            }
            return false;
        }
    },
    
    /**
     * Activates a waiting service worker
     */
    activateWaiting(registration) {
        if (registration?.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            return true;
        }
        return false;
    },
    
    /**
     * Gets the current service worker state
     */
    getState(registration) {
        if (!registration) {
            return { state: 'not_registered', hasUpdate: false };
        }
        
        return {
            state: registration.active ? 'active' : 'inactive',
            hasUpdate: Boolean(registration.waiting),
            installing: Boolean(registration.installing),
            scope: registration.scope,
            updateViaCache: registration.updateViaCache
        };
    },
    
    /**
     * Unregisters the service worker
     */
    async unregister(registration) {
        if (!registration) return false;
        
        try {
            const result = await registration.unregister();
            if (window.DevLogger?.debug) {
                window.DevLogger.debug('[PWA] Service Worker unregistered:', result);
            }
            return result;
        } catch (error) {
            if (window.DevLogger?.debug) {
                window.DevLogger.debug('[PWA] Service Worker unregistration failed:', error);
            }
            return false;
        }
    },
    
    /**
     * Posts a message to the service worker
     */
    postMessage(registration, message) {
        if (registration?.active) {
            registration.active.postMessage(message);
            return true;
        }
        return false;
    },
    
    /**
     * Posts a message to service worker with response
     */
    postMessageWithResponse(registration, message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            if (!registration?.active) {
                reject(new Error('No active service worker'));
                return;
            }
            
            const messageChannel = new MessageChannel();
            const timeoutId = setTimeout(() => {
                reject(new Error('Service Worker response timeout'));
            }, timeout);
            
            messageChannel.port1.onmessage = (event) => {
                clearTimeout(timeoutId);
                resolve(event.data);
            };
            
            try {
                registration.active.postMessage(message, [messageChannel.port2]);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    },
    
    /**
     * Gets all service worker registrations
     */
    async getAllRegistrations() {
        if (!('serviceWorker' in navigator)) return [];
        
        try {
            return await navigator.serviceWorker.getRegistrations();
        } catch (error) {
            return [];
        }
    },
    
    /**
     * Checks if service worker is supported
     */
    isSupported() {
        return 'serviceWorker' in navigator;
    },
    
    /**
     * Gets service worker capabilities
     */
    getCapabilities() {
        return {
            serviceWorker: 'serviceWorker' in navigator,
            pushManager: 'PushManager' in window,
            notification: 'Notification' in window,
            backgroundSync: 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype,
            backgroundFetch: 'serviceWorker' in navigator && 'BackgroundFetch' in window,
            periodicBackgroundSync: 'serviceWorker' in navigator && 'periodicSync' in window.ServiceWorkerRegistration.prototype
        };
    },
    
    /**
     * Handles service worker errors
     */
    handleError(error, context = 'unknown') {
        const errorMessage = `Service Worker error in ${context}: ${error.message}`;
        
        if (window.DevLogger?.error) {
            window.DevLogger.error('[PWA]', errorMessage, error);
        }
        
        // Could dispatch custom event for error handling
        window.dispatchEvent(new CustomEvent('sw-error', {
            detail: { error, context, message: errorMessage }
        }));
        
        return errorMessage;
    },
    
    /**
     * Validates service worker script
     */
    async validateScript(swPath) {
        try {
            // Use fetchData from window.Utils with cache control options for service worker validation
            await window.Utils.fetchData(swPath, { 
                headers: { 'Cache-Control': 'no-cache' }
            });
            return true;
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Gets service worker performance metrics
     */
    getPerformanceMetrics(registration) {
        if (!registration) return null;
        
        const metrics = {
            registrationTime: registration.installing?.scriptURL ? Date.now() : null,
            scope: registration.scope,
            updateViaCache: registration.updateViaCache
        };
        
        // Add navigation API timing if available
        if (window.performance?.getEntriesByType) {
            const navigationEntries = window.performance.getEntriesByType('navigation');
            if (navigationEntries.length > 0) {
                const entry = navigationEntries[0];
                metrics.pageLoadTime = entry.loadEventEnd - entry.loadEventStart;
                metrics.domContentLoadedTime = entry.domContentLoadedEventEnd - entry.domContentLoadedEventStart;
            }
        }
        
        return metrics;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pwaServiceWorker };
} else if (typeof window !== 'undefined') {
    window.pwaServiceWorker = pwaServiceWorker;
}
