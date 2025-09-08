/**
 * PWA Manager - Main Module
 * 
 * Coordinates all PWA functionality and provides the main interface.
 */

// Import required modules
if (typeof window !== 'undefined') {
    // Browser environment - modules loaded via script tags
} else {
    // Node.js environment - for testing
    // eslint-disable-next-line no-unused-vars
    const { pwaServiceWorker } = require('./service-worker');
    // eslint-disable-next-line no-unused-vars
    const { pwaInstallation } = require('./installation');
    // eslint-disable-next-line no-unused-vars
    const { pwaOffline } = require('./offline');
    // eslint-disable-next-line no-unused-vars
    const { pwaCache } = require('./cache');
    // eslint-disable-next-line no-unused-vars
    const { pwaUI } = require('./ui');
}

/**
 * Main PWA Manager class
 */
class PWAManager {
    constructor(options = {}) {
        this.options = {
            enableLogging: true,
            autoUpdate: true,
            enableOfflineMode: true,
            enableInstallPrompt: true,
            enableCaching: true,
            enableNotifications: true,
            ...options
        };
        
        this.state = {
            isInitialized: false,
            isOnline: navigator.onLine,
            isInstalled: false,
            hasUpdate: false,
            swRegistration: null,
            deferredPrompt: null,
            offlineState: null
        };
        
        this.callbacks = {
            onReady: null,
            onInstalled: null,
            onUpdateAvailable: null,
            onOffline: null,
            onOnline: null,
            onError: null,
            ...options.callbacks
        };
        
        // Initialize notification queue
        if (this.options.enableNotifications) {
            this.notificationQueue = window.pwaUI?.createNotificationQueue?.(3);
        }
        
        this.init();
    }
    
    /**
     * Initializes the PWA Manager
     */
    async init() {
        if (this.state.isInitialized) return;
        
        try {
            this.log('Initializing PWA Manager...');
            
            // Check installation status
            if (this.options.enableInstallPrompt) {
                await this.initInstallation();
            }
            
            // Register service worker
            await this.initServiceWorker();
            
            // Initialize offline capabilities
            if (this.options.enableOfflineMode) {
                await this.initOfflineMode();
            }
            
            // Initialize UI components
            if (this.options.enableNotifications) {
                this.initUI();
            }
            
            this.state.isInitialized = true;
            this.log('PWA Manager initialized successfully');
            
            if (this.callbacks.onReady) {
                this.callbacks.onReady(this.getStatus());
            }
            
        } catch (error) {
            this.handleError('Initialization failed', error);
        }
    }
    
    /**
     * Initializes installation management
     */
    async initInstallation() {
        if (!window.pwaInstallation) {
            this.log('Installation module not available', 'warn');
            return;
        }
        
        // Check current installation status
        const status = window.pwaInstallation.checkInstallationStatus();
        this.state.isInstalled = status.isInstalled;
        
        // Set up installation event listeners
        const installManager = window.pwaInstallation.setupEventListeners({
            onInstallPromptAvailable: (event) => {
                this.state.deferredPrompt = event;
                this.showInstallPrompt();
            },
            onAppInstalled: () => {
                this.state.isInstalled = true;
                this.hideInstallPrompt();
                this.showNotification('App Installed!', 'LoRA Manager is now available from your home screen.', 'success');
                
                if (this.callbacks.onInstalled) {
                    this.callbacks.onInstalled();
                }
            }
        });
        
        // Store cleanup function
        this.installCleanup = installManager.cleanup;
        this.getDeferredPrompt = installManager.getDeferredPrompt;
    }
    
    /**
     * Initializes service worker
     */
    async initServiceWorker() {
        if (!window.pwaServiceWorker) {
            this.log('Service Worker module not available', 'warn');
            return;
        }
        
        try {
            // Register service worker
            this.state.swRegistration = await window.pwaServiceWorker.register();
            
            // Set up service worker event listeners
            this.swCleanup = window.pwaServiceWorker.setupEventListeners(
                this.state.swRegistration,
                {
                    onUpdateAvailable: () => {
                        this.state.hasUpdate = true;
                        this.showUpdateAvailable();
                        
                        if (this.callbacks.onUpdateAvailable) {
                            this.callbacks.onUpdateAvailable();
                        }
                    },
                    onControllerChange: () => {
                        window.location.reload();
                    }
                }
            );
            
            // Check for updates if enabled
            if (this.options.autoUpdate) {
                await this.checkForUpdates();
            }
            
        } catch (error) {
            this.handleError('Service Worker initialization failed', error);
        }
    }
    
    /**
     * Initializes offline mode
     */
    async initOfflineMode() {
        if (!window.pwaOffline) {
            this.log('Offline module not available', 'warn');
            return;
        }
        
        // Initialize offline state
        this.state.offlineState = window.pwaOffline.init({
            onOnline: () => {
                this.state.isOnline = true;
                this.showNotification('Back Online!', 'Connection restored. Syncing data...', 'success');
                
                if (this.callbacks.onOnline) {
                    this.callbacks.onOnline();
                }
            },
            onOffline: () => {
                this.state.isOnline = false;
                this.showNotification('You\'re Offline', 'Working in offline mode with cached data.', 'warning');
                
                if (this.callbacks.onOffline) {
                    this.callbacks.onOffline();
                }
            }
        });
        
        // Create offline indicator
        const indicator = window.pwaOffline.createOfflineIndicator();
        document.body.appendChild(indicator);
        
        // Update initial status
        window.pwaOffline.toggleOfflineIndicator(!this.state.isOnline);
    }
    
    /**
     * Initializes UI components
     */
    initUI() {
        if (!window.pwaUI) {
            this.log('UI module not available', 'warn');
            return;
        }
        
        // Apply responsive styles
        window.pwaUI.applyResponsiveStyles();
        
        // Handle window resize
        window.addEventListener('resize', () => {
            window.pwaUI.applyResponsiveStyles();
        });
    }
    
    /**
     * Shows install prompt
     */
    showInstallPrompt() {
        if (!window.pwaInstallation || this.state.isInstalled) return;
        
        const dismissal = window.pwaInstallation.manageInstallDismissal();
        if (dismissal.isDismissed()) return;
        
        const prompt = window.pwaInstallation.createInstallPrompt();
        document.body.appendChild(prompt);
        
        // Set up event listeners
        prompt.querySelector('#pwa-install-btn').addEventListener('click', () => {
            this.installApp();
        });
        
        prompt.querySelector('#pwa-dismiss-btn').addEventListener('click', () => {
            dismissal.dismiss();
            this.hideInstallPrompt();
        });
        
        prompt.querySelector('#pwa-close-btn').addEventListener('click', () => {
            this.hideInstallPrompt();
        });
    }
    
    /**
     * Hides install prompt
     */
    hideInstallPrompt() {
        const prompt = document.getElementById('pwa-install-prompt');
        if (prompt) {
            prompt.remove();
        }
    }
    
    /**
     * Installs the PWA
     */
    async installApp() {
        if (!this.state.deferredPrompt) {
            this.showNotification('Installation Not Available', 'Install option is not currently available.', 'warning');
            return;
        }
        
        try {
            const result = await window.pwaInstallation.triggerInstall(this.state.deferredPrompt);
            
            if (result.userChoice) {
                this.log('User accepted install prompt');
            } else {
                this.log('User dismissed install prompt');
            }
            
            this.state.deferredPrompt = null;
            this.hideInstallPrompt();
            
        } catch (error) {
            this.handleError('Installation failed', error);
        }
    }
    
    /**
     * Shows update available notification
     */
    showUpdateAvailable() {
        if (!window.pwaUI) return;
        
        window.pwaUI.showUpdateBanner(
            () => this.updateApp(),
            () => this.log('User dismissed update notification')
        );
    }
    
    /**
     * Updates the app
     */
    updateApp() {
        if (!this.state.swRegistration) return;
        
        window.pwaServiceWorker.activateWaiting(this.state.swRegistration);
    }
    
    /**
     * Checks for app updates
     */
    async checkForUpdates() {
        if (!this.state.swRegistration) return;
        
        try {
            await window.pwaServiceWorker.checkForUpdates(this.state.swRegistration);
        } catch (error) {
            this.handleError('Update check failed', error);
        }
    }
    
    /**
     * Shows notification
     */
    showNotification(title, message, type = 'info') {
        if (!this.options.enableNotifications || !window.pwaUI) return;
        
        if (this.notificationQueue) {
            this.notificationQueue.add(title, message, type);
        } else {
            window.pwaUI.showNotification(title, message, type);
        }
    }
    
    /**
     * Gets cache information
     */
    async getCacheInfo() {
        if (!this.state.swRegistration || !window.pwaCache) return null;
        
        try {
            return await window.pwaCache.getCacheStatus(this.state.swRegistration);
        } catch (error) {
            this.handleError('Failed to get cache info', error);
            return null;
        }
    }
    
    /**
     * Clears cache
     */
    async clearCache() {
        if (!this.state.swRegistration || !window.pwaCache) return false;
        
        try {
            const success = await window.pwaCache.clearAllCaches(this.state.swRegistration);
            if (success) {
                this.showNotification('Cache Cleared', 'All cached data has been removed.', 'success');
            }
            return success;
        } catch (error) {
            this.handleError('Failed to clear cache', error);
            return false;
        }
    }
    
    /**
     * Gets PWA status
     */
    getStatus() {
        return {
            isInitialized: this.state.isInitialized,
            isOnline: this.state.isOnline,
            isInstalled: this.state.isInstalled,
            hasUpdate: this.state.hasUpdate,
            hasServiceWorker: Boolean(this.state.swRegistration),
            queuedActions: this.state.offlineState?.queuedActions?.length || 0,
            capabilities: window.pwaServiceWorker?.getCapabilities?.() || {},
            installCriteria: window.pwaInstallation?.getInstallCriteria?.() || {}
        };
    }
    
    /**
     * Gets analytics data
     */
    getAnalytics() {
        return {
            installation: window.pwaInstallation?.getInstallationAnalytics?.() || {},
            offline: window.pwaOffline?.getOfflineStatus?.(this.state.offlineState) || {},
            serviceWorker: window.pwaServiceWorker?.getPerformanceMetrics?.(this.state.swRegistration) || {},
            timestamp: Date.now()
        };
    }
    
    /**
     * Handles errors
     */
    handleError(context, error) {
        const message = `PWA Manager - ${context}: ${error.message}`;
        
        this.log(message, 'error');
        
        if (this.callbacks.onError) {
            this.callbacks.onError(error, context);
        }
        
        // Show user-friendly error notification
        if (this.options.enableNotifications) {
            this.showNotification('Error', 'Something went wrong. Please try again.', 'error');
        }
    }
    
    /**
     * Logs messages
     */
    log(message, level = 'info') {
        if (!this.options.enableLogging) return;
        
        const logMessage = `[PWA Manager] ${message}`;
        
        if (window.DevLogger) {
            window.DevLogger[level]?.(logMessage);
        } else {
            // eslint-disable-next-line no-console
            console[level]?.(logMessage);
        }
    }
    
    /**
     * Cleanup method
     */
    destroy() {
        if (this.installCleanup) {
            this.installCleanup();
        }
        
        if (this.swCleanup) {
            this.swCleanup();
        }
        
        if (this.notificationQueue) {
            this.notificationQueue.clear();
        }
        
        this.state.isInitialized = false;
    }
}

// Initialize PWA Manager when DOM is loaded
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        window.pwaManager = new PWAManager();
    });
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PWAManager;
} else if (typeof window !== 'undefined') {
    window.PWAManager = PWAManager;
}
