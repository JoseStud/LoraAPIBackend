/**
 * Core Module Index
 * 
 * Main entry point for the core component loading system.
 * Exports and initializes all core modules for use by templates and other scripts.
 */

// Import and initialize the component loader system
// Note: In a browser environment, these would be loaded via script tags

/**
 * Initialize the core component loading system
 */
function initializeCore() {
    if (window.DevLogger && window.DevLogger.debug) {
        window.DevLogger.debug('[Core] Initializing component loading system...');
    }

    // Initialize the component loader core
    if (window.componentLoaderCore && typeof window.componentLoaderCore.init === 'function') {
        window.componentLoaderCore.init();
    }

    // Initialize the component registry
    if (window.componentRegistry && typeof window.componentRegistry.init === 'function') {
        window.componentRegistry.init();
    }

    if (window.DevLogger && window.DevLogger.debug) {
        window.DevLogger.debug('[Core] Component loading system initialized');
    }
}

/**
 * Get the status of the core system
 * @returns {Object} Status information
 */
function getCoreStatus() {
    const status = {
        initialized: false,
        alpineReady: false,
        componentsLoaded: 0,
        stubsCreated: 0,
        errors: []
    };

    try {
        if (window.componentLoaderCore) {
            const coreStatus = window.componentLoaderCore.getStatus();
            status.initialized = coreStatus.isInitialized;
            status.alpineReady = coreStatus.isAlpineReady;
            status.componentsLoaded = coreStatus.componentsCount;
            status.stubsCreated = coreStatus.stubsCount;
        }

        if (window.componentRegistry) {
            status.registeredComponents = window.componentRegistry.getRegisteredComponents();
            status.pendingComponents = window.componentRegistry.getPendingComponents();
        }
    } catch (error) {
        status.errors.push(error.message);
    }

    return status;
}

/**
 * ComponentLoader compatibility interface
 * Provides backward compatibility with the old ComponentLoader global
 */
const ComponentLoader = {
    // Core properties
    components: {},
    stubs: {},
    loadedScripts: new Set(),
    isAlpineReady: false,
    isInitialized: false,

    /**
     * Initialize the component loader
     */
    init() {
        initializeCore();
        this.isInitialized = true;
    },

    /**
     * Create stubs (delegated to core)
     */
    createStubs() {
        if (window.componentLoaderCore) {
            window.componentLoaderCore.createStubs();
            this.stubs = window.componentLoaderCore.stubs;
        }
    },

    /**
     * Wait for Alpine.js
     */
    waitForAlpine() {
        if (window.componentLoaderCore) {
            window.componentLoaderCore.waitForAlpine();
        }
    },

    /**
     * Register a component
     * @param {string} name - Component name
     * @param {Function} factory - Component factory
     */
    registerComponent(name, factory) {
        if (window.RegistrationHelpers) {
            window.RegistrationHelpers.registerComponent(name, factory);
        }
        this.components[name] = factory;
    },

    /**
     * Register a stub
     * @param {string} name - Component name
     * @param {Function} factory - Stub factory
     */
    registerStub(name, factory) {
        if (window.RegistrationHelpers) {
            window.RegistrationHelpers.registerStub(name, factory);
        }
        this.stubs[name] = factory;
    },

    /**
     * Load a script dynamically
     * @param {string} scriptUrl - Script URL
     * @returns {Promise<void>} Load promise
     */
    async loadScript(scriptUrl) {
        if (window.componentLoaderCore) {
            return await window.componentLoaderCore.loadScript(scriptUrl);
        }
        return Promise.resolve();
    },

    /**
     * Check if component is loaded
     * @param {string} name - Component name
     * @returns {boolean} True if loaded
     */
    isComponentLoaded(name) {
        if (window.componentLoaderCore) {
            return window.componentLoaderCore.isComponentLoaded(name);
        }
        return Object.prototype.hasOwnProperty.call(this.components, name);
    },

    /**
     * Get loader status
     * @returns {Object} Status object
     */
    getStatus() {
        return getCoreStatus();
    }
};

/**
 * Auto-initialize when DOM is ready
 */
function autoInitialize() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeCore);
    } else {
        // DOM is already ready
        setTimeout(initializeCore, 0);
    }
}

// Export the core interface
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeCore,
        getCoreStatus,
        ComponentLoader
    };
} else if (typeof window !== 'undefined') {
    // Make ComponentLoader available globally for backward compatibility
    window.ComponentLoader = ComponentLoader;
    
    // Expose core functions
    window.initializeCore = initializeCore;
    window.getCoreStatus = getCoreStatus;

    // Auto-initialize the system
    autoInitialize();
}
