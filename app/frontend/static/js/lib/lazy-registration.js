/**
 * Lazy Registration Utilities for Alpine.js Components
 * 
 * Provides utilities for registering Alpine components that can be loaded
 * asynchronously while preventing ExpressionErrors during template parsing.
 */

/**
 * Registers a lazy Alpine component that delegates to a global function
 * when it becomes available. Prevents ExpressionErrors in templates.
 * 
 * @param {string} name - Component name to register
 */
function registerLazyComponent(name) {
    if (typeof Alpine === 'undefined') {
        if (window.DevLogger && window.DevLogger.warn) {
            window.DevLogger.warn(`Cannot register ${name}: Alpine not available`);
        }
        return;
    }

    Alpine.data(name, () => {
        let backing = null;
        
        /**
         * Try to initialize the backing component if the global function is available
         */
        function tryInit() {
            if (!backing && typeof window[name] === 'function') {
                try {
                    backing = window[name]();
                } catch (e) {
                    if (window.DevLogger && window.DevLogger.error) {
                        window.DevLogger.error(`Failed to initialize ${name}:`, e);
                    }
                    backing = {};
                }
            }
        }

        // Create the lazy component proxy
        const local = window.getCommonStub ? window.getCommonStub(name) : { init() {} };
        
        return {
            /**
             * Initialize the component - tries to delegate to real implementation
             */
            init() {
                tryInit();
                if (backing && typeof backing.init === 'function') {
                    try {
                        backing.init.call(this);
                    } catch (e) {
                        if (window.DevLogger && window.DevLogger.error) {
                            window.DevLogger.error(`Error in ${name}.init():`, e);
                        }
                    }
                } else if (local && typeof local.init === 'function') {
                    local.init.call(this);
                }
            },

            /**
             * Get the backing implementation (for debugging)
             */
            get _backing() {
                tryInit();
                return backing;
            },

            /**
             * Check if the real implementation is loaded
             */
            get _isReal() {
                return backing !== null;
            },

            /**
             * Spread all properties from the common stub
             * Real components will re-register and override these
             */
            ...local
        };
    });
}

/**
 * Helper to defer Alpine registrations until Alpine is ready
 * 
 * @param {Function} callback - Function to call when Alpine is available
 */
function ensureAlpine(callback) {
    if (typeof window.Alpine !== 'undefined') {
        try {
            callback();
        } catch (e) {
            if (window.DevLogger && window.DevLogger.error) {
                window.DevLogger.error('Error in ensureAlpine callback:', e);
            }
        }
    } else {
        document.addEventListener('alpine:init', () => {
            try {
                callback();
            } catch (e) {
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error('Error in alpine:init callback:', e);
                }
            }
        }, { once: true });
    }
}

/**
 * Register multiple lazy components at once
 * 
 * @param {string[]} componentNames - Array of component names to register
 */
function registerLazyComponents(componentNames) {
    ensureAlpine(() => {
        componentNames.forEach(registerLazyComponent);
    });
}

/**
 * Wait for Alpine to be ready and return a promise
 * 
 * @returns {Promise<void>} Promise that resolves when Alpine is ready
 */
function waitForAlpine() {
    return new Promise((resolve) => {
        if (typeof window.Alpine !== 'undefined') {
            resolve();
        } else {
            document.addEventListener('alpine:init', resolve, { once: true });
        }
    });
}

/**
 * Check if a component is already registered with Alpine
 * 
 * @param {string} name - Component name to check
 * @returns {boolean} True if component is registered
 */
function isComponentRegistered(name) {
    return typeof Alpine !== 'undefined' && 
           Alpine._x_dataStack && 
           Alpine._x_dataStack.some(stack => stack[name]);
}

/**
 * Upgrade a lazy component to its real implementation
 * This is called when the real component script loads
 * 
 * @param {string} name - Component name
 * @param {Function} factory - Real component factory function
 */
function upgradeComponent(name, factory) {
    if (typeof Alpine === 'undefined') {
        if (window.DevLogger && window.DevLogger.warn) {
            window.DevLogger.warn(`Cannot upgrade ${name}: Alpine not available`);
        }
        return;
    }

    // Store the real factory globally so lazy components can find it
    window[name] = factory;

    // Re-register with Alpine to replace the lazy version
    Alpine.data(name, factory);

    if (window.DevLogger && window.DevLogger.debug) {
        window.DevLogger.debug(`Component ${name} upgraded to real implementation`);
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        registerLazyComponent,
        registerLazyComponents,
        ensureAlpine,
        waitForAlpine,
        isComponentRegistered,
        upgradeComponent
    };
} else if (typeof window !== 'undefined') {
    // Make functions available globally
    Object.assign(window, {
        registerLazyComponent,
        registerLazyComponents,
        ensureAlpine,
        waitForAlpine,
        isComponentRegistered,
        upgradeComponent
    });
}
