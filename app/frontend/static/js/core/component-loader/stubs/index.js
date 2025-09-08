/**
 * Component Stubs - Main Index
 * 
 * Provides all component stub definitions for the component loader.
 * These stubs prevent Alpine.js errors when templates reference components
 * that haven't loaded yet.
 */

/**
 * Create mobile navigation stub
 * @returns {Function} Mobile nav component factory
 */
function createMobileNavStub() {
    return function() {
        return {
            isOpen: false,
            init() {
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentStub] mobileNav initialized');
                }
            },
            toggleMenu() { 
                this.isOpen = !this.isOpen;
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentStub] mobileNav toggle:', this.isOpen);
                }
            },
            closeMenu() { 
                this.isOpen = false;
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentStub] mobileNav closed');
                }
            },
            openMenu() { 
                this.isOpen = true;
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentStub] mobileNav opened');
                }
            }
        };
    };
}

/**
 * Create recommendations data stub
 * @returns {Function} Recommendations component factory
 */
function createRecommendationsStub() {
    return function() {
        const stub = window.getCommonStub ? window.getCommonStub('recommendationsData') : {};
        
        return {
            // Tab state
            activeTab: 'similarity',
            
            // Available LoRAs
            availableLoras: [],
            
            // Similarity explorer
            selectedLoraId: '',
            selectedLora: null,
            weights: { semantic: 0.6, artistic: 0.3, technical: 0.1 },
            similarityLimit: 10,
            similarityThreshold: 0.1,
            
            // Prompt-based recommendations
            promptText: '',
            promptLimit: 10,
            promptIncludeInactive: false,
            promptSuggestions: [],
            
            // Embedding status
            computingEmbeddings: false,
            rebuildingIndex: false,
            embeddingProgress: 0,
            embeddingStatus: '',

            init() {
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentStub] recommendationsData initialized');
                }
            },
            
            // Spread common stub properties
            ...stub
        };
    };
}

/**
 * Create LoRA gallery stub
 * @returns {Function} LoRA gallery component factory
 */
function createLoraGalleryStub() {
    return function() {
        const stub = window.getCommonStub ? window.getCommonStub('loraGallery') : {};
        
        return {
            // UI state
            viewMode: 'grid',
            searchTerm: '',
            filters: { 
                activeOnly: false, 
                hasEmbeddings: false, 
                tags: [], 
                sortBy: 'name' 
            },
            bulkMode: false,
            allSelected: false,
            selectedLoras: [],
            availableLoras: [],
            pageSize: 24,
            currentPage: 1,
            hasMore: false,
            
            init() {
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentStub] loraGallery initialized');
                }
            },
            
            // Spread common stub properties
            ...stub
        };
    };
}

/**
 * Create generation studio stub
 * @returns {Function} Generation studio component factory
 */
function createGenerationStudioStub() {
    return function() {
        const stub = window.getCommonStub ? window.getCommonStub('generationStudio') : {};
        
        return {
            params: { 
                prompt: '', 
                negative_prompt: '', 
                width: 512, 
                height: 512, 
                steps: 20, 
                cfg_scale: 7.0, 
                seed: -1, 
                batch_count: 1, 
                batch_size: 1 
            },
            activeJobs: [],
            recentResults: [],
            systemStatus: {},
            isGenerating: false,
            showHistory: false,
            showModal: false,
            selectedResult: null,
            
            init() {
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentStub] generationStudio initialized');
                }
            },
            
            // Spread common stub properties
            ...stub
        };
    };
}

/**
 * Create system admin stub
 * @returns {Function} System admin component factory
 */
function createSystemAdminStub() {
    return function() {
        const stub = window.getCommonStub ? window.getCommonStub('systemAdmin') : {};
        
        return {
            // State
            activeTab: 'monitoring',
            isRefreshing: false,
            showMaintenance: false,
            
            // System Status
            systemStatus: {
                overall: 'healthy',
                last_check: new Date().toISOString()
            },
            
            // System Statistics
            systemStats: {
                uptime: '0d 0h 0m',
                active_workers: 0,
                total_workers: 0,
                database_size: 0,
                total_records: 0,
                gpu_memory_used: '0GB',
                gpu_memory_total: '0GB'
            },
            
            // Workers
            workers: [],
            
            init() {
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentStub] systemAdmin initialized');
                }
            },
            
            // Spread common stub properties
            ...stub
        };
    };
}

/**
 * Create basic stub for simple components
 * @param {string} name - Component name
 * @returns {Function} Basic component factory
 */
function createBasicStub(name) {
    return function() {
        const stub = window.getCommonStub ? window.getCommonStub(name) : {};
        
        return {
            init() {
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug(`[ComponentStub] ${name} initialized`);
                }
            },
            
            // Spread common stub properties
            ...stub
        };
    };
}

/**
 * Create all component stubs
 * @returns {Object} Object containing all stub factories
 */
function createAllStubs() {
    const stubs = {
        // Specialized stubs with custom properties
        mobileNav: createMobileNavStub(),
        recommendationsData: createRecommendationsStub(),
        loraGallery: createLoraGalleryStub(),
        generationStudio: createGenerationStudioStub(),
        systemAdmin: createSystemAdminStub()
    };

    // Basic stubs for simpler components
    const basicComponents = [
        'generationHistory', 'performanceAnalytics', 'importExport',
        'promptComposer', 'offlinePage', 'promptRecommendations',
        'loraCard', 'dashboard', 'searchFilter', 'generationMonitor'
    ];

    basicComponents.forEach(name => {
        stubs[name] = createBasicStub(name);
    });

    return stubs;
}

/**
 * Get stub for specific component
 * @param {string} name - Component name
 * @returns {Function|null} Stub factory or null if not found
 */
function getStub(name) {
    const stubs = createAllStubs();
    return stubs[name] || null;
}

/**
 * Register a custom stub
 * @param {string} name - Component name
 * @param {Function} factory - Stub factory function
 */
function registerStub(name, factory) {
    if (window.componentLoaderCore && window.componentLoaderCore.stubs) {
        window.componentLoaderCore.stubs[name] = factory;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createAllStubs,
        getStub,
        registerStub,
        createMobileNavStub,
        createRecommendationsStub,
        createLoraGalleryStub,
        createGenerationStudioStub,
        createSystemAdminStub,
        createBasicStub
    };
} else if (typeof window !== 'undefined') {
    window.ComponentStubs = {
        createAllStubs,
        getStub,
        registerStub,
        createMobileNavStub,
        createRecommendationsStub,
        createLoraGalleryStub,
        createGenerationStudioStub,
        createSystemAdminStub,
        createBasicStub
    };
}
