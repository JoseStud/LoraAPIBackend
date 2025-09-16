/**
 * PWA Installation and Management
 * Handles service worker registration, installation prompts, and offline features
 */

class PWAManager {
    constructor() {
        this.swRegistration = null;
        this.deferredPrompt = null;
        this.isOnline = navigator.onLine;
        this.isInstalled = false;
        this.hasUpdate = false;
        this.queuedActions = []; // Initialize queued actions array
        
        this.init();
    }
    
    async init() {
        // Load queued actions from localStorage
        try {
            const stored = localStorage.getItem('pwa-queued-actions');
            this.queuedActions = stored ? JSON.parse(stored) : [];
        } catch (error) {
            this.queuedActions = [];
        }
        
        // Check if PWA is already installed
        this.checkInstallationStatus();
        
        // Register service worker
        await this.registerServiceWorker();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize offline detection
        this.initOfflineDetection();
        
        // Set up background sync
        this.initBackgroundSync();
        
        // Check for app updates
        this.checkForUpdates();
    }
    
    /**
     * Register the service worker
     */
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
                    scope: '/'
                });
                
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('[PWA] Service Worker registered:', this.swRegistration);
                
                // Handle service worker updates
                this.swRegistration.addEventListener('updatefound', () => {
                    const newWorker = this.swRegistration.installing;
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.hasUpdate = true;
                            this.showUpdateAvailable();
                        }
                    });
                });
                
                // Handle service worker controller changes
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    window.location.reload();
                });
                
            } catch (error) {
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('[PWA] Service Worker registration failed:', error);
            }
        }
    }
    
    /**
     * Set up PWA event listeners
     */
    setupEventListeners() {
        // Install prompt
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });
        
        // App installed
        window.addEventListener('appinstalled', () => {
            this.isInstalled = true;
            this.hideInstallPrompt();
            this.showInstallSuccess();
        });
        
        // Online/offline detection
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.handleOnlineStatus(true);
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.handleOnlineStatus(false);
        });
        
        // Visibility change (for background sync)
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                this.syncPendingActions();
            }
        });
    }
    
    /**
     * Check if PWA is installed
     */
    checkInstallationStatus() {
        // Check if running as PWA
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                            window.navigator.standalone ||
                            document.referrer.includes('android-app://');
        
        this.isInstalled = isStandalone;
        
        // Check if install banner was dismissed
        const installDismissed = localStorage.getItem('pwa-install-dismissed');
        if (installDismissed) {
            const dismissedTime = parseInt(installDismissed);
            const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
            
            // Show prompt again after 7 days
            if (daysSinceDismissed > 7) {
                localStorage.removeItem('pwa-install-dismissed');
            }
        }
    }
    
    /**
     * Initialize offline detection and UI
     */
    initOfflineDetection() {
        // Create offline indicator
        this.createOfflineIndicator();
        
        // Update UI based on current status
        this.handleOnlineStatus(this.isOnline);
    }
    
    /**
     * Create offline status indicator
     */
    createOfflineIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.className = 'fixed top-0 left-0 right-0 bg-yellow-500 text-white text-center py-2 text-sm font-medium transform -translate-y-full transition-transform duration-300 z-50';
        indicator.innerHTML = `
            <div class="flex items-center justify-center space-x-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                </svg>
                <span>You're offline. Some features may be limited.</span>
            </div>
        `;
        
        document.body.appendChild(indicator);
    }
    
    /**
     * Handle online/offline status changes
     */
    handleOnlineStatus(isOnline) {
        const indicator = document.getElementById('offline-indicator');
        
        if (isOnline) {
            // Hide offline indicator
            if (indicator) {
                indicator.classList.add('-translate-y-full');
            }
            
            // Sync pending actions
            this.syncPendingActions();
            
            // Show online notification
            if (!this.isOnline) {
                this.showNotification('Back online!', 'Connection restored. Syncing data...', 'success');
            }
        } else {
            // Show offline indicator
            if (indicator) {
                indicator.classList.remove('-translate-y-full');
            }
            
            // Show offline notification
            this.showNotification('You\'re offline', 'Working in offline mode with cached data.', 'warning');
        }
        
        // Update API calls to handle offline state
        this.updateAPIBehavior(isOnline);
    }
    
    /**
     * Show install prompt
     */
    showInstallPrompt() {
        if (this.isInstalled || !this.deferredPrompt || localStorage.getItem('pwa-install-dismissed')) {
            return;
        }
        
        const prompt = document.createElement('div');
        prompt.id = 'pwa-install-prompt';
        prompt.className = 'fixed bottom-4 left-4 right-4 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-50 max-w-sm mx-auto';
        prompt.innerHTML = `
            <div class="flex items-start space-x-3">
                <div class="flex-shrink-0">
                    <img src="/static/images/icons/icon-72x72.png" alt="LoRA Manager" class="w-12 h-12 rounded-lg">
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-lg font-semibold text-gray-900">Install LoRA Manager</h3>
                    <p class="text-sm text-gray-600 mt-1">Get the full app experience with offline access and faster loading.</p>
                    <div class="flex space-x-3 mt-3">
                        <button id="pwa-install-btn" class="btn btn-primary btn-sm">
                            Install App
                        </button>
                        <button id="pwa-dismiss-btn" class="btn btn-ghost btn-sm">
                            Not now
                        </button>
                    </div>
                </div>
                <button id="pwa-close-btn" class="flex-shrink-0 text-gray-400 hover:text-gray-600">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(prompt);
        
        // Add event listeners
        document.getElementById('pwa-install-btn').addEventListener('click', () => {
            this.installApp();
        });
        
        document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
            this.dismissInstallPrompt();
        });
        
        document.getElementById('pwa-close-btn').addEventListener('click', () => {
            this.hideInstallPrompt();
        });
        
        // Auto-show after 30 seconds
        setTimeout(() => {
            if (prompt.parentNode) {
                prompt.classList.add('animate-bounce-in');
            }
        }, 30000);
    }
    
    /**
     * Install the PWA
     */
    async installApp() {
        if (!this.deferredPrompt) return;
        
            try {
                const result = await this.deferredPrompt.prompt();
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('[PWA] Install prompt result:', result);
            
            if (result.outcome === 'accepted') {
                this.showNotification('Installing...', 'LoRA Manager is being installed.', 'info');
            }
            
            this.deferredPrompt = null;
            this.hideInstallPrompt();
            
        } catch (error) {
            window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('[PWA] Install failed:', error);
            // Fallback to Alpine notifications when available
            try {
                if (window.Alpine && typeof Alpine.store === 'function') {
                    const notifications = Alpine.store('notifications');
                    if (notifications && typeof notifications.add === 'function') {
                        notifications.add('Installation failed', 'error');
                    } else {
                        this.showNotification('Installation failed', 'Please try again later.', 'error');
                    }
                } else {
                    this.showNotification('Installation failed', 'Please try again later.', 'error');
                }
            } catch (e) {
                this.showNotification('Installation failed', 'Please try again later.', 'error');
            }
        }
    }
    
    /**
     * Dismiss install prompt temporarily
     */
    dismissInstallPrompt() {
        localStorage.setItem('pwa-install-dismissed', Date.now().toString());
        this.hideInstallPrompt();
    }
    
    /**
     * Hide install prompt
     */
    hideInstallPrompt() {
        const prompt = document.getElementById('pwa-install-prompt');
        if (prompt) {
            prompt.remove();
        }
    }
    
    /**
     * Show install success message
     */
    showInstallSuccess() {
        this.showNotification(
            'App Installed!', 
            'LoRA Manager has been installed. You can now access it from your home screen.',
            'success'
        );
    }
    
    /**
     * Check for app updates
     */
    async checkForUpdates() {
        if (!this.swRegistration) return;
        
        try {
            await this.swRegistration.update();
            } catch (error) {
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('[PWA] Update check failed:', error);
            }
    }
    
    /**
     * Show update available notification
     */
    showUpdateAvailable() {
        const updateBanner = document.createElement('div');
        updateBanner.id = 'update-banner';
        updateBanner.className = 'fixed top-0 left-0 right-0 bg-blue-600 text-white text-center py-3 z-50';
        updateBanner.innerHTML = `
            <div class="flex items-center justify-center space-x-4">
                <span class="text-sm font-medium">A new version is available!</span>
                <button id="update-app-btn" class="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100">
                    Update Now
                </button>
                <button id="dismiss-update-btn" class="text-blue-200 hover:text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(updateBanner);
        
        document.getElementById('update-app-btn').addEventListener('click', () => {
            this.updateApp();
        });
        
        document.getElementById('dismiss-update-btn').addEventListener('click', () => {
            updateBanner.remove();
        });
    }
    
    /**
     * Update the app
     */
    updateApp() {
        if (this.swRegistration && this.swRegistration.waiting) {
            this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    }
    
    /**
     * Initialize background sync
     */
    initBackgroundSync() {
        // Queue actions when offline (defensive)
        try {
            this.queuedActions = JSON.parse(localStorage.getItem('pwa-queued-actions') || '[]');
            if (!Array.isArray(this.queuedActions)) this.queuedActions = [];
        } catch (e) {
            this.queuedActions = [];
        }

        // Process queue when coming online
        if (this.isOnline && this.queuedActions && this.queuedActions.length > 0) {
            try { this.syncPendingActions(); } catch (e) { window.DevLogger && window.DevLogger.error && window.DevLogger.error('[PWA] syncPendingActions error:', e); }
        }
    }
    
    /**
     * Queue action for background sync
     */
    queueAction(action) {
        // Defensive: ensure queuedActions is properly initialized
        if (!this.queuedActions) {
            this.queuedActions = [];
        }
        if (!Array.isArray(this.queuedActions)) {
            this.queuedActions = [];
        }
        
        this.queuedActions.push({
            ...action,
            timestamp: Date.now()
        });
        
        localStorage.setItem('pwa-queued-actions', JSON.stringify(this.queuedActions));
        
        // Try to sync immediately if online
        if (this.isOnline) {
            this.syncPendingActions();
        }
    }
    
    /**
     * Sync pending actions
     */
    async syncPendingActions() {
        // Defensive: ensure queuedActions is an array
        if (!this.queuedActions) {
            this.queuedActions = [];
        }
        if (!Array.isArray(this.queuedActions)) {
            this.queuedActions = [];
        }
        if (!this.isOnline || this.queuedActions.length === 0) return;

        const actionsToSync = [...this.queuedActions];
        this.queuedActions = [];
        
        for (const action of actionsToSync) {
            try {
                // Use fetchData from window.Utils for better error handling
                await window.Utils.fetchData(action.url, action.options);
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('[PWA] Synced action:', action.url);
            } catch (error) {
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('[PWA] Failed to sync action:', error);
                // Re-queue failed actions
                this.queuedActions.push(action);
            }
        }
        
        localStorage.setItem('pwa-queued-actions', JSON.stringify(this.queuedActions));
        
        if (actionsToSync.length > 0) {
            this.showNotification('Sync Complete', 'Offline actions have been synchronized.', 'success');
        }
    }
    
    /**
     * Update API behavior for offline mode
     */
    updateAPIBehavior(isOnline) {
        // Intercept fetch requests to handle offline scenarios
        const originalFetch = window.fetch;
        
        window.fetch = async (url, options = {}) => {
            try {
                if (!isOnline && options.method && options.method !== 'GET') {
                    // Queue non-GET requests when offline
                    this.queueAction({ url, options });
                    
                    return new Response(JSON.stringify({
                        success: false,
                        message: 'Action queued for when connection is restored',
                        offline: true
                    }), {
                        status: 202,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                return await originalFetch(url, options);
            } catch (error) {
                if (!isOnline) {
                    // Return cached data or offline message
                    return new Response(JSON.stringify({
                        success: false,
                        message: 'You are offline. Please check your connection.',
                        offline: true
                    }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                throw error;
            }
        };
    }
    
    /**
     * Show notification
     */
    showNotification(title, message, type = 'info') {
        // Use mobile-friendly toast notification
        const toast = document.createElement('div');
        toast.className = `mobile-toast ${type}`;
        toast.innerHTML = `
            <div class="flex items-start space-x-3">
                <div class="flex-shrink-0">
                    ${this.getNotificationIcon(type)}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-semibold">${title}</div>
                    <div class="text-sm opacity-90">${message}</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => toast.classList.add('enter-active'), 100);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            toast.classList.remove('enter-active');
            toast.classList.add('exit-active');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
    
    /**
     * Get notification icon
     */
    getNotificationIcon(type) {
        const icons = {
            success: '<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
            error: '<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
            warning: '<svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg>',
            info: '<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
        };
        
        return icons[type] || icons.info;
    }
    
    /**
     * Get cache information
     */
    async getCacheInfo() {
        if (!this.swRegistration) return null;
        
        return new Promise((resolve) => {
            const messageChannel = new MessageChannel();
            messageChannel.port1.onmessage = (event) => {
                resolve(event.data);
            };
            
            this.swRegistration.active.postMessage(
                { type: 'GET_CACHE_STATUS' },
                [messageChannel.port2]
            );
        });
    }
    
    /**
     * Clear all caches
     */
    async clearCache() {
        if (this.swRegistration) {
            this.swRegistration.active.postMessage({ type: 'CLEAR_CACHE' });
            this.showNotification('Cache Cleared', 'All cached data has been removed.', 'success');
        }
    }
}

// Initialize PWA Manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.pwaManager = new PWAManager();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PWAManager;
}
