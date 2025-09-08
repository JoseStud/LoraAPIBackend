/**
 * Component Registration Utilities
 * 
 * Provides utilities for registering components with Alpine.js,
 * managing component lifecycle, and handling component upgrades.
 */

/**
 * Component Registry Class
 */
class ComponentRegistry {
    constructor() {
        this.registeredComponents = new Set();
        this.pendingComponents = new Map();
        this.isAlpineReady = false;
    }

    /**
     * Initialize the registry
     */
    init() {
        this.waitForAlpine();
    }

    /**
     * Wait for Alpine.js to be ready
     */
    waitForAlpine() {
        if (typeof window.Alpine !== 'undefined') {
            this.onAlpineReady();
        } else {
            document.addEventListener('alpine:init', () => {
                this.onAlpineReady();
            }, { once: true });
        }
    }

    /**
     * Called when Alpine.js is ready
     */
    onAlpineReady() {
        this.isAlpineReady = true;
        
        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug('[ComponentRegistry] Alpine.js ready');
        }

        // Process pending registrations
        this.processPendingRegistrations();
    }

    /**
     * Register a component with Alpine.js
     * @param {string} name - Component name
     * @param {Function} factory - Component factory function
     * @param {Object} options - Registration options
     */
    register(name, factory, options = {}) {
        if (!this.isAlpineReady) {
            // Store for later registration
            this.pendingComponents.set(name, { factory, options });
            return;
        }

        try {
            // Register with Alpine
            if (window.Alpine && window.Alpine.data) {
                window.Alpine.data(name, factory);
                this.registeredComponents.add(name);
                
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug(`[ComponentRegistry] Registered component: ${name}`);
                }

                // Make factory available globally for lazy loading
                if (options.global !== false) {
                    window[name] = factory;
                }

                // Fire registration event
                this.fireRegistrationEvent(name, factory);
            }
        } catch (error) {
            if (window.DevLogger && window.DevLogger.error) {
                window.DevLogger.error(`[ComponentRegistry] Failed to register ${name}:`, error);
            }
        }
    }

    /**
     * Register multiple components at once
     * @param {Object} components - Object with component name -> factory mappings
     * @param {Object} options - Global options for all components
     */
    registerMultiple(components, options = {}) {
        Object.entries(components).forEach(([name, factory]) => {
            this.register(name, factory, options);
        });
    }

    /**
     * Unregister a component
     * @param {string} name - Component name to unregister
     */
    unregister(name) {
        this.registeredComponents.delete(name);
        this.pendingComponents.delete(name);
        
        // Remove global reference
        if (window[name]) {
            delete window[name];
        }

        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug(`[ComponentRegistry] Unregistered component: ${name}`);
        }
    }

    /**
     * Check if a component is registered
     * @param {string} name - Component name
     * @returns {boolean} True if component is registered
     */
    isRegistered(name) {
        return this.registeredComponents.has(name);
    }

    /**
     * Process pending registrations
     */
    processPendingRegistrations() {
        this.pendingComponents.forEach(({ factory, options }, name) => {
            this.register(name, factory, options);
        });
        this.pendingComponents.clear();
    }

    /**
     * Fire custom event when component is registered
     * @param {string} name - Component name
     * @param {Function} factory - Component factory
     */
    fireRegistrationEvent(name, factory) {
        if (typeof window.dispatchEvent === 'function') {
            const event = new CustomEvent('component:registered', {
                detail: { name, factory }
            });
            window.dispatchEvent(event);
        }
    }

    /**
     * Get list of registered components
     * @returns {string[]} Array of registered component names
     */
    getRegisteredComponents() {
        return Array.from(this.registeredComponents);
    }

    /**
     * Get list of pending components
     * @returns {string[]} Array of pending component names
     */
    getPendingComponents() {
        return Array.from(this.pendingComponents.keys());
    }

    /**
     * Clear all registrations (useful for testing)
     */
    clear() {
        this.registeredComponents.clear();
        this.pendingComponents.clear();
    }
}

/**
 * Alpine.js Registration Helpers
 */
const RegistrationHelpers = {
    /**
     * Register a component factory with Alpine.js
     * @param {string} name - Component name
     * @param {Function} factory - Component factory function
     */
    registerComponent(name, factory) {
        if (window.componentRegistry) {
            window.componentRegistry.register(name, factory);
        } else if (typeof window.Alpine !== 'undefined' && window.Alpine.data) {
            window.Alpine.data(name, factory);
            window[name] = factory;
        } else {
            if (window.DevLogger && window.DevLogger.warn) {
                window.DevLogger.warn(`Cannot register ${name}: Alpine.js not available`);
            }
        }
    },

    /**
     * Register a stub component
     * @param {string} name - Component name
     * @param {Function} stubFactory - Stub factory function
     */
    registerStub(name, stubFactory) {
        this.registerComponent(name, stubFactory);
    },

    /**
     * Upgrade a stub to a real component
     * @param {string} name - Component name
     * @param {Function} realFactory - Real component factory
     */
    upgradeComponent(name, realFactory) {
        // Replace the existing registration
        this.registerComponent(name, realFactory);
        
        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug(`[RegistrationHelpers] Upgraded component: ${name}`);
        }
    },

    /**
     * Register lazy component with fallback
     * @param {string} name - Component name
     */
    registerLazyComponent(name) {
        if (window.registerLazyComponent) {
            window.registerLazyComponent(name);
        } else {
            // Fallback registration
            const factory = () => {
                const stub = window.getCommonStub ? window.getCommonStub(name) : { init() {} };
                return stub;
            };
            this.registerComponent(name, factory);
        }
    },

    /**
     * Wait for Alpine to be ready and execute callback
     * @param {Function} callback - Callback to execute
     */
    whenAlpineReady(callback) {
        if (typeof window.Alpine !== 'undefined') {
            callback();
        } else {
            document.addEventListener('alpine:init', callback, { once: true });
        }
    },

    /**
     * Create a component factory with error handling
     * @param {Function} factory - Original factory function
     * @param {string} name - Component name for error reporting
     * @returns {Function} Wrapped factory function
     */
    createSafeFactory(factory, name) {
        return function(...args) {
            try {
                return factory.apply(this, args);
            } catch (error) {
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error(`Component factory error in ${name}:`, error);
                }
                // Return fallback stub
                return window.getCommonStub ? window.getCommonStub(name) : { init() {} };
            }
        };
    },

    /**
     * Register component with automatic error handling
     * @param {string} name - Component name
     * @param {Function} factory - Component factory
     * @param {Object} _options - Registration options (future use)
     */
    registerSafeComponent(name, factory, _options = {}) {
        const safeFactory = this.createSafeFactory(factory, name);
        this.registerComponent(name, safeFactory);
    }
};

// Create singleton registry instance
const componentRegistry = new ComponentRegistry();

// Auto-initialize
componentRegistry.init();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ComponentRegistry, RegistrationHelpers, componentRegistry };
} else if (typeof window !== 'undefined') {
    window.ComponentRegistry = ComponentRegistry;
    window.RegistrationHelpers = RegistrationHelpers;
    window.componentRegistry = componentRegistry;
}
