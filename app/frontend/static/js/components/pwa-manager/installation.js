/**
 * PWA Manager - Installation Module
 * 
 * Handles PWA installation prompts, detection, and installation flow.
 */

/**
 * PWA installation management operations
 */
const pwaInstallation = {
    /**
     * Checks if PWA is currently installed
     */
    checkInstallationStatus() {
        // Check various PWA indicators
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
        const isNavigatorStandalone = window.navigator.standalone === true;
        const isAndroidApp = document.referrer.includes('android-app://');
        const isIOSStandalone = window.navigator.standalone;
        
        return {
            isInstalled: isStandalone || isNavigatorStandalone || isAndroidApp || isIOSStandalone,
            standalone: isStandalone,
            navigatorStandalone: isNavigatorStandalone,
            androidApp: isAndroidApp,
            iosStandalone: Boolean(isIOSStandalone)
        };
    },
    
    /**
     * Sets up installation event listeners
     */
    setupEventListeners(callbacks = {}) {
        let deferredPrompt = null;
        
        // Handle beforeinstallprompt
        const handleBeforeInstallPrompt = (event) => {
            event.preventDefault();
            deferredPrompt = event;
            
            if (callbacks.onInstallPromptAvailable) {
                callbacks.onInstallPromptAvailable(event);
            }
        };
        
        // Handle app installed
        const handleAppInstalled = (event) => {
            deferredPrompt = null;
            
            if (callbacks.onAppInstalled) {
                callbacks.onAppInstalled(event);
            }
        };
        
        // Handle display mode changes
        const handleDisplayModeChange = (event) => {
            if (callbacks.onDisplayModeChange) {
                callbacks.onDisplayModeChange(event.matches);
            }
        };
        
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.addEventListener('appinstalled', handleAppInstalled);
        
        // Monitor display mode changes
        const standaloneMedia = window.matchMedia('(display-mode: standalone)');
        standaloneMedia.addListener(handleDisplayModeChange);
        
        // Return cleanup function and current prompt
        return {
            cleanup: () => {
                window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
                window.removeEventListener('appinstalled', handleAppInstalled);
                standaloneMedia.removeListener(handleDisplayModeChange);
            },
            getDeferredPrompt: () => deferredPrompt,
            setDeferredPrompt: (prompt) => { deferredPrompt = prompt; }
        };
    },
    
    /**
     * Triggers the install prompt
     */
    async triggerInstall(deferredPrompt) {
        if (!deferredPrompt) {
            throw new Error('No deferred install prompt available');
        }
        
        try {
            const result = await deferredPrompt.prompt();
            
            if (window.DevLogger?.debug) {
                window.DevLogger.debug('[PWA] Install prompt result:', result);
            }
            
            return {
                outcome: result.outcome,
                userChoice: result.outcome === 'accepted'
            };
            
        } catch (error) {
            throw new Error(`Install prompt failed: ${error.message}`);
        }
    },
    
    /**
     * Checks if installation is supported
     */
    isInstallSupported() {
        // Check for various PWA installation methods
        return {
            beforeInstallPrompt: 'BeforeInstallPromptEvent' in window || 'onbeforeinstallprompt' in window,
            appleWebApp: /iPad|iPhone|iPod/.test(navigator.userAgent),
            androidWebApp: /Android/.test(navigator.userAgent),
            chromeWebApp: 'chrome' in window && 'webstore' in window.chrome,
            edgeWebApp: navigator.userAgent.includes('Edg/'),
            firefoxWebApp: navigator.userAgent.includes('Firefox/')
        };
    },
    
    /**
     * Gets installation criteria status
     */
    getInstallCriteria() {
        return {
            isHTTPS: location.protocol === 'https:' || location.hostname === 'localhost',
            hasManifest: Boolean(document.querySelector('link[rel="manifest"]')),
            hasServiceWorker: 'serviceWorker' in navigator,
            hasValidManifest: this.validateManifest(),
            isInstallable: this.checkInstallability()
        };
    },
    
    /**
     * Validates the web app manifest
     */
    async validateManifest() {
        const manifestLink = document.querySelector('link[rel="manifest"]');
        if (!manifestLink) return false;
        
        try {
            const response = await fetch(manifestLink.href);
            const manifest = await response.json();
            
            // Check required fields
            const required = ['name', 'short_name', 'start_url', 'display', 'icons'];
            const hasRequired = required.every(field => manifest[field]);
            
            // Check for valid icon
            const hasValidIcon = manifest.icons && manifest.icons.some(icon => 
                icon.sizes && (icon.sizes.includes('192x192') || icon.sizes.includes('512x512'))
            );
            
            return {
                valid: hasRequired && hasValidIcon,
                manifest,
                missingFields: required.filter(field => !manifest[field]),
                hasValidIcon
            };
            
        } catch (error) {
            return { valid: false, error: error.message };
        }
    },
    
    /**
     * Checks overall installability
     */
    checkInstallability() {
        const criteria = this.getInstallCriteria();
        return criteria.isHTTPS && criteria.hasManifest && criteria.hasServiceWorker;
    },
    
    /**
     * Manages install prompt dismissal
     */
    manageInstallDismissal() {
        const STORAGE_KEY = 'pwa-install-dismissed';
        const REMINDER_DAYS = 7;
        
        return {
            isDismissed() {
                const dismissedTime = localStorage.getItem(STORAGE_KEY);
                if (!dismissedTime) return false;
                
                const daysSince = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
                return daysSince < REMINDER_DAYS;
            },
            
            dismiss() {
                localStorage.setItem(STORAGE_KEY, Date.now().toString());
            },
            
            clearDismissal() {
                localStorage.removeItem(STORAGE_KEY);
            },
            
            getDismissedTime() {
                const time = localStorage.getItem(STORAGE_KEY);
                return time ? new Date(parseInt(time)) : null;
            },
            
            getDaysSinceDismissed() {
                const time = localStorage.getItem(STORAGE_KEY);
                if (!time) return null;
                
                return (Date.now() - parseInt(time)) / (1000 * 60 * 60 * 24);
            }
        };
    },
    
    /**
     * Creates install prompt UI
     */
    createInstallPrompt(options = {}) {
        const {
            title = 'Install App',
            message = 'Install this app for a better experience?',
            installText = 'Install',
            dismissText = 'Not Now',
            className = 'pwa-install-prompt'
        } = options;
        
        const prompt = document.createElement('div');
        prompt.id = 'pwa-install-prompt';
        prompt.className = `${className} fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50`;
        
        prompt.innerHTML = `
            <div class="flex items-start space-x-3">
                <div class="flex-shrink-0">
                    <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
                        </svg>
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="text-sm font-semibold text-gray-900">${title}</h3>
                    <p class="text-sm text-gray-600 mt-1">${message}</p>
                    <div class="flex space-x-2 mt-3">
                        <button id="pwa-install-btn" class="btn btn-primary btn-sm">
                            ${installText}
                        </button>
                        <button id="pwa-dismiss-btn" class="btn btn-ghost btn-sm">
                            ${dismissText}
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
        
        return prompt;
    },
    
    /**
     * Shows platform-specific install instructions
     */
    showPlatformInstructions() {
        const userAgent = navigator.userAgent;
        let instructions = '';
        
        if (/iPad|iPhone|iPod/.test(userAgent)) {
            instructions = 'Tap the share button and select "Add to Home Screen"';
        } else if (/Android/.test(userAgent)) {
            instructions = 'Tap the menu button and select "Add to Home Screen" or "Install App"';
        } else if (userAgent.includes('Chrome')) {
            instructions = 'Click the install button in the address bar or menu';
        } else if (userAgent.includes('Firefox')) {
            instructions = 'This app can be installed from supported browsers like Chrome or Edge';
        } else if (userAgent.includes('Safari')) {
            instructions = 'Use the share menu and select "Add to Home Screen"';
        } else {
            instructions = 'Use a supported browser like Chrome, Firefox, or Safari to install this app';
        }
        
        return {
            platform: this.detectPlatform(),
            instructions,
            canInstall: this.isInstallSupported()
        };
    },
    
    /**
     * Detects the user's platform
     */
    detectPlatform() {
        const userAgent = navigator.userAgent;
        
        if (/iPad|iPhone|iPod/.test(userAgent)) return 'ios';
        if (/Android/.test(userAgent)) return 'android';
        if (/Windows/.test(userAgent)) return 'windows';
        if (/Mac/.test(userAgent)) return 'mac';
        if (/Linux/.test(userAgent)) return 'linux';
        
        return 'unknown';
    },
    
    /**
     * Gets installation analytics data
     */
    getInstallationAnalytics() {
        const installStatus = this.checkInstallationStatus();
        const criteria = this.getInstallCriteria();
        const support = this.isInstallSupported();
        const dismissal = this.manageInstallDismissal();
        
        return {
            isInstalled: installStatus.isInstalled,
            isInstallable: this.checkInstallability(),
            platform: this.detectPlatform(),
            supportLevel: Object.values(support).filter(Boolean).length,
            criteriaStatus: criteria,
            dismissalStatus: {
                isDismissed: dismissal.isDismissed(),
                daysSinceDismissed: dismissal.getDaysSinceDismissed()
            },
            userAgent: navigator.userAgent,
            timestamp: Date.now()
        };
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pwaInstallation };
} else if (typeof window !== 'undefined') {
    window.pwaInstallation = pwaInstallation;
}
