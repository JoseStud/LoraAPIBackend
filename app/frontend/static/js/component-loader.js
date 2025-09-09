/**
 * Unified Component Loading System
 * Handles proper timing, stubs, and registration for Alpine.js components
 */

/* eslint-disable no-console */

window.ComponentLoader = {
    // Component definitions
    components: {},
    stubs: {},
    loadedScripts: new Set(),
    isAlpineReady: false,
    isInitialized: false,

    // Initialize the component loader
    init() {
        if (this.isInitialized) return;
        this.isInitialized = true;

        console.log('[ComponentLoader] Initializing...');

        // Set up logging
        this.setupLogging();
        
        // Create comprehensive stubs first
        this.createStubs();
        
        // Wait for dependencies before Alpine.js
        this.waitForDependencies();
        
        console.log('[ComponentLoader] Initialization complete');
    },

    // Wait for required dependencies to be available
    waitForDependencies() {
        const checkDependencies = () => {
            const required = ['DevLogger'];
            const missing = required.filter(dep => typeof window[dep] === 'undefined');
            
            if (missing.length === 0) {
                console.log('[ComponentLoader] All dependencies available');
                this.waitForAlpine();
            } else {
                console.log('[ComponentLoader] Waiting for dependencies:', missing);
                setTimeout(checkDependencies, 50);
            }
        };
        
        checkDependencies();
    },

    setupLogging() {
        // Enhanced logging for development
        window.__DEV_LOG_IMPL__ = {
            debug: function(...args) { 
                if (typeof console !== 'undefined' && console.log) {
                    console.log('[DEBUG]', ...args);
                }
            },
            warn: function(...args) { 
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[WARN]', ...args);
                }
            },
            error: function(...args) { 
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[ERROR]', ...args);
                }
            }
        };

        window.__DEV_CONSOLE__ = true;
        window.DevLogger = {
            debug(...args) { 
                if (window.__DEV_CONSOLE__ && window.__DEV_LOG_IMPL__?.debug) {
                    window.__DEV_LOG_IMPL__.debug(...args); 
                }
            },
            warn(...args) { 
                if (window.__DEV_CONSOLE__ && window.__DEV_LOG_IMPL__?.warn) {
                    window.__DEV_LOG_IMPL__.warn(...args); 
                }
            },
            error(...args) { 
                if (window.__DEV_CONSOLE__ && window.__DEV_LOG_IMPL__?.error) {
                    window.__DEV_LOG_IMPL__.error(...args); 
                }
            }
        };
    },

    // Create robust stubs that prevent Alpine.js errors
    createStubs() {
        console.log('[ComponentLoader] Creating component stubs...');

        // Mobile navigation stub with all required properties
        this.stubs.mobileNav = function() {
            return {
                isOpen: false,
                init() { console.log('[ComponentLoader] mobileNav stub initialized'); },
                toggleMenu() { 
                    this.isOpen = !this.isOpen; 
                    console.log('[ComponentLoader] mobileNav toggle:', this.isOpen);
                },
                closeMenu() { 
                    this.isOpen = false; 
                    console.log('[ComponentLoader] mobileNav closed');
                },
                openMenu() { 
                    this.isOpen = true; 
                    console.log('[ComponentLoader] mobileNav opened');
                }
            };
        };

        // Recommendations data stub with all template properties
        this.stubs.recommendationsData = function() {
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

                init() { console.log('[ComponentLoader] recommendationsData stub initialized'); },
                loadAvailableLoras() { console.log('[ComponentLoader] loadAvailableLoras stub called'); },
                loadSelectedLora() { console.log('[ComponentLoader] loadSelectedLora stub called'); },
                updateRecommendations() { console.log('[ComponentLoader] updateRecommendations stub called'); },
                searchByPrompt() { console.log('[ComponentLoader] searchByPrompt stub called'); },
                resetWeights() { 
                    this.weights = { semantic: 0.6, artistic: 0.3, technical: 0.1 };
                    console.log('[ComponentLoader] resetWeights stub called'); 
                },
                computeAllEmbeddings() { console.log('[ComponentLoader] computeAllEmbeddings stub called'); },
                rebuildIndex() { console.log('[ComponentLoader] rebuildIndex stub called'); },
                viewHealthReport() { console.log('[ComponentLoader] viewHealthReport stub called'); }
            };
        };

        // Additional component stubs
        const additionalStubs = [
            'generationStudio', 'generationHistory', 'performanceAnalytics', 'importExport',
            'loraGallery', 'promptComposer', 'systemAdmin', 'offlinePage', 'promptRecommendations',
            'loraCard', 'dashboard', 'searchFilter', 'generationMonitor'
        ];

        additionalStubs.forEach(name => {
            // Provide richer defaults for components whose templates reference many properties
            if (name === 'loraGallery') {
                this.stubs[name] = function() {
                    return {
                        // Readiness
                        isInitialized: false,
                        // UI state
                        viewMode: 'grid',
                        searchTerm: '',
                        filters: { activeOnly: false, hasEmbeddings: false, tags: [], sortBy: 'name' },
                        bulkMode: false,
                        allSelected: false,
                        selectedLoras: [],
                        availableLoras: [],
                        pageSize: 24,
                        currentPage: 1,
                        hasMore: false,
                        init() { console.log('[ComponentLoader] loraGallery stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'generationStudio') {
                this.stubs[name] = function() {
                    return {
                        isInitialized: false,
                        params: { prompt: '', negative_prompt: '', width: 512, height: 512, steps: 20, cfg_scale: 7.0, seed: -1, batch_count: 1, batch_size: 1 },
                        activeJobs: [],
                        recentResults: [],
                        systemStatus: {},
                        isGenerating: false,
                        showHistory: false,
                        showModal: false,
                        selectedResult: null,
                        showToast: false,
                        toastMessage: '',
                        websocket: null,
                        init() { console.log('[ComponentLoader] generationStudio stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'generationHistory') {
                this.stubs[name] = function() {
                    return {
                        isInitialized: false,
                        results: [],
                        filteredResults: [],
                        viewMode: 'grid',
                        isLoading: false,
                        currentPage: 1,
                        pageSize: 24,
                        hasMore: false,
                        stats: { total_results: 0, avg_rating: 0, total_favorites: 0, total_size: 0 },
                        init() { console.log('[ComponentLoader] generationHistory stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'performanceAnalytics') {
                this.stubs[name] = function() {
                    return {
                        isInitialized: false,
                        isLoading: false,
                        timeRange: '24h',
                        autoRefresh: false,
                        kpis: { total_generations: 0, generation_growth: 0, avg_generation_time: 0, time_improvement: 0, success_rate: 0, total_failed: 0, active_loras: 0, total_loras: 0 },
                        topLoras: [],
                        errorAnalysis: [],
                        performanceInsights: [],
                        chartData: { generationVolume: [], performance: [], loraUsage: [], resourceUsage: [] },
                        init() { console.log('[ComponentLoader] performanceAnalytics stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'promptComposer') {
                this.stubs[name] = function() {
                    return {
                        isInitialized: false,
                        availableLoras: [],
                        filteredLoras: [],
                        activeLoras: [],
                        searchTerm: '',
                        activeOnly: false,
                        basePrompt: '',
                        negativePrompt: '',
                        finalPrompt: '',
                        isLoading: false,
                        isGenerating: false,
                        showToast: false,
                        toastMessage: '',
                        init() { console.log('[ComponentLoader] promptComposer stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'systemAdmin') {
                this.stubs[name] = function() {
                    return {
                        isInitialized: false,
                        activeTab: 'monitoring',
                        isRefreshing: false,
                        showMaintenance: false,
                        showToast: false,
                        toastMessage: '',
                        toastType: 'success',
                        systemStatus: { overall: 'unknown' },
                        systemStats: {},
                        systemMetrics: {},
                        workers: [],
                        dbStats: {},
                        config: {},
                        logs: [],
                        recentBackups: [],
                        init() { console.log('[ComponentLoader] systemAdmin stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'offlinePage') {
                this.stubs[name] = function() {
                    return {
                        isInitialized: false,
                        cacheInfo: {},
                        isOnline: true,
                        init() { console.log('[ComponentLoader] offlinePage stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'promptRecommendations') {
                this.stubs[name] = function() {
                    return {
                        isInitialized: false,
                        suggestions: [],
                        init() { console.log('[ComponentLoader] promptRecommendations stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'searchFilter') {
                this.stubs[name] = function() {
                    return {
                        searchTerm: '',
                        filters: { activeOnly: false, hasEmbeddings: false, tags: [], sortBy: 'name' },
                        availableTags: [],
                        init() { console.log('[ComponentLoader] searchFilter stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'generationMonitor') {
                this.stubs[name] = function() {
                    return {
                        activeJobs: [],
                        init() { console.log('[ComponentLoader] generationMonitor stub initialized'); }
                    };
                };
                return;
            }

            if (name === 'loraCard') {
                this.stubs[name] = function() {
                    return {
                        open: false,
                        isFavorite: false,
                        isSelected: false,
                        isInComposition: false,
                        init() { console.log('[ComponentLoader] loraCard stub initialized'); }
                    };
                };
                return;
            }

            // Default minimal stub for other components
            this.stubs[name] = function() {
                return {
                    init() { console.log(`[ComponentLoader] ${name} stub initialized`); }
                };
            };
        });

        // Make stubs globally available immediately
        Object.assign(window, this.stubs);

        console.log('[ComponentLoader] Stubs created and made available globally');
    },

    // Wait for Alpine.js and register components
    waitForAlpine() {
        // Poll for Alpine.js to appear. When it does, register stubs immediately
        // before Alpine initializes, and then proceed to register real components.
        const checkAlpine = () => {
            if (typeof window.Alpine !== 'undefined') {
                console.log('[ComponentLoader] Alpine detected');
                try { this.registerStubsWithAlpine(); } catch (e) { console.warn('[ComponentLoader] registerStubsWithAlpine failed', e); }
                this.onAlpineReady();
            } else {
                console.log('[ComponentLoader] Waiting for Alpine.js...');
                setTimeout(checkAlpine, 50);
            }
        };

        checkAlpine();
    },

    // Register stubs immediately with Alpine.js to prevent expression errors
    registerStubsWithAlpine() {
        console.log('[ComponentLoader] Registering stubs with Alpine.js...');
        
        Object.entries(this.stubs).forEach(([name, factory]) => {
            try {
                Alpine.data(name, factory);
                console.log(`[ComponentLoader] Registered stub: ${name}`);
            } catch (error) {
                console.error(`[ComponentLoader] Failed to register stub ${name}:`, error);
            }
        });
        
        console.log('[ComponentLoader] All stubs registered with Alpine.js');
    },

    onAlpineReady() {
        console.log('[ComponentLoader] Alpine.js is ready, registering components...');
        this.isAlpineReady = true;
        
        // Register all available components
        this.registerComponents();
        
        console.log('[ComponentLoader] Component registration complete');
        
        // If Alpine auto-start was deferred, start it now so it will initialize
        // with our registered components instead of creating ExpressionErrors.
        // Do not force Alpine to start here; calling Alpine.start() after it
        // has already initialized can cause double-initialization problems.
        // If Alpine hasn't initialized, the environment should set
        // `window.deferLoadingAlpine = true` and Alpine will wait; otherwise
        // re-registering components via Alpine.data is sufficient.
        if (window.deferLoadingAlpine) {
            console.log('[ComponentLoader] Alpine was deferred; components registered. Do not call Alpine.start() to avoid double-init.');
        } else {
            console.log('[ComponentLoader] Alpine auto-start not deferred; components registered.');
        }
    },

    // Register a component factory
    registerComponent(name, factory) {
        console.log(`[ComponentLoader] Registering component: ${name}`);
        this.components[name] = factory;
        
        // If Alpine is ready, register immediately
        if (this.isAlpineReady && typeof window.Alpine !== 'undefined') {
            this.registerSingleComponent(name, factory);
            
            // Hot-swap existing component instances if needed
            this.hotSwapComponent(name, factory);
        }
    },

    // Hot-swap component instances that are already bound to DOM elements
    hotSwapComponent(name, factory) {
        try {
            // Find all elements using this component
            const elements = document.querySelectorAll(`[x-data*="${name}"]`);
            
            if (elements.length > 0) {
                console.log(`[ComponentLoader] Hot-swapping ${elements.length} instances of ${name}`);
                
                elements.forEach(element => {
                    try {
                        // Get the current Alpine.js data
                        const currentData = Alpine.$data(element);
                        
                        if (currentData) {
                            // Create new component instance
                            const newInstance = factory();
                            
                            // Transfer current state to new instance where possible
                            Object.keys(currentData).forEach(key => {
                                if (key in newInstance && typeof newInstance[key] !== 'function') {
                                    newInstance[key] = currentData[key];
                                }
                            });
                            
                            // Replace the component data
                            Object.assign(currentData, newInstance);
                            
                            // Initialize the new component if it has an init method
                            if (typeof newInstance.init === 'function') {
                                newInstance.init.call(currentData);
                            }
                            
                            console.log(`[ComponentLoader] Hot-swapped ${name} on element`);
                        }
                    } catch (error) {
                        console.warn(`[ComponentLoader] Failed to hot-swap ${name} on element:`, error);
                    }
                });
            }
        } catch (error) {
            console.error(`[ComponentLoader] Hot-swap error for ${name}:`, error);
        }
    },

    // Register a single component with Alpine.js
    registerSingleComponent(name, factory) {
        try {
            // Validate component before registration
            if (this.validateComponent(name, factory)) {
                // Re-register with Alpine.js to replace stub
                Alpine.data(name, factory);
                console.log(`[ComponentLoader] Successfully registered ${name} with Alpine.js`);
                
                // Update global reference
                window[name] = factory;
                
                // Mark this component as properly loaded
                this.components[name] = factory;
            } else {
                console.warn(`[ComponentLoader] Component ${name} validation failed, keeping stub`);
            }
        } catch (error) {
            console.error(`[ComponentLoader] Failed to register ${name}:`, error);
        }
    },

    // Validate that a component has required properties
    validateComponent(name, factory) {
        try {
            const instance = factory();
            
            // Check if it has basic required properties for Alpine.js
            if (typeof instance !== 'object' || instance === null) {
                console.warn(`[ComponentLoader] ${name}: Component must return an object`);
                return false;
            }
            
            // Component-specific validations
            if (name === 'recommendationsData') {
                const required = ['activeTab', 'availableLoras', 'weights', 'computingEmbeddings'];
                const missing = required.filter(prop => !(prop in instance));
                if (missing.length > 0) {
                    console.warn(`[ComponentLoader] ${name}: Missing required properties:`, missing);
                    return false;
                }
            }
            
            if (name === 'mobileNav') {
                const required = ['isOpen', 'toggleMenu', 'closeMenu'];
                const missing = required.filter(prop => !(prop in instance));
                if (missing.length > 0) {
                    console.warn(`[ComponentLoader] ${name}: Missing required properties:`, missing);
                    return false;
                }
            }
            
            console.log(`[ComponentLoader] ${name}: Validation passed`);
            return true;
        } catch (error) {
            console.error(`[ComponentLoader] ${name}: Validation error:`, error);
            return false;
        }
    },

    // Register all components with Alpine.js
    registerComponents() {
        Object.entries(this.components).forEach(([name, factory]) => {
            this.registerSingleComponent(name, factory);
        });

        // Register additional simple components
        this.registerSimpleComponents();
    },

    registerSimpleComponents() {
        console.log('[ComponentLoader] Registering simple components...');

        // Search filter component
        Alpine.data('searchFilter', () => ({
            searchTerm: '',
            filters: {
                activeOnly: false,
                hasEmbeddings: false,
                tags: [],
                sortBy: 'name'
            },
            availableTags: [],
            
            async init() {
                await this.loadAvailableTags();
            },
            
            async loadAvailableTags() {
                try {
                    const tags = await window.APIService?.getAdapterTags?.() || [];
                    this.availableTags = tags;
                } catch (error) {
                    console.error('[ComponentLoader] Failed to load tags:', error);
                }
            },
            
            search() {
                document.body.dispatchEvent(new CustomEvent('search-changed', {
                    detail: { search: this.searchTerm }
                }));
            },
            
            applyFilters() {
                document.body.dispatchEvent(new CustomEvent('filter-changed', {
                    detail: { filters: this.filters }
                }));
            }
        }));

        // Dashboard component
        Alpine.data('dashboard', () => ({
            // Readiness flag to guard template rendering
            isInitialized: false,
            // Loading flag used by dashboard template for refresh UI
            loading: false,
            stats: {
                total_loras: 0,
                active_loras: 0,
                embeddings_coverage: 0,
                recent_activities_count: 0
            },
            systemHealth: {
                status: 'unknown',
                gpu_status: '-' 
            },
            
            async init() {
                await this.refreshData();
                this.isInitialized = true;
            },
            
            async refreshData() {
                try {
                    const data = await window.APIService?.getDashboardStats?.() || {};
                    this.stats = data.stats || this.stats;
                    this.systemHealth = data.system_health || this.systemHealth;
                } catch (e) {
                    console.debug('[ComponentLoader] Dashboard data not available');
                }
            }
        }));

        // Generation monitor component
        Alpine.data('generationMonitor', () => ({
            activeJobs: [],
            
            async init() {
                this.connectWebSocket();
                await this.loadActiveJobs();
            },
            
            connectWebSocket() {
                document.addEventListener('generation-progress', (event) => {
                    this.updateJobProgress(event.detail);
                });
                
                document.addEventListener('job-complete', (event) => {
                    this.handleJobComplete(event.detail);
                });
            },
            
            async loadActiveJobs() {
                try {
                    const jobs = await window.APIService?.getActiveJobs?.() || [];
                    this.activeJobs = jobs;
                } catch (error) {
                    console.error('[ComponentLoader] Failed to load active jobs:', error);
                }
            },
            
            updateJobProgress(data) {
                const job = this.activeJobs.find(j => j.id === data.job_id);
                if (job) {
                    job.progress = data.progress;
                    job.status = data.status;
                }
            },
            
            handleJobComplete(data) {
                this.activeJobs = this.activeJobs.filter(j => j.id !== data.job_id);
                console.log(`[ComponentLoader] Job ${data.job_id} completed`);
            }
        }));

        console.log('[ComponentLoader] Simple components registered');
    },

    // Check component availability for debugging
    checkComponentAvailability() {
        console.log('[ComponentLoader] Component availability check:');
        
        const requiredComponents = ['mobileNav', 'recommendationsData', 'dashboard', 'searchFilter'];
        
        requiredComponents.forEach(name => {
            const isGloballyAvailable = typeof window[name] === 'function';
            const isInStubs = name in this.stubs;
            const isInComponents = name in this.components;
            
            console.log(`[ComponentLoader] ${name}:`, {
                globally_available: isGloballyAvailable,
                in_stubs: isInStubs,
                in_components: isInComponents
            });
        });
    },

    // Load component factories from external scripts
    loadComponentFactory(name, scriptUrl) {
        if (this.loadedScripts.has(scriptUrl)) {
            console.log(`[ComponentLoader] Script already loaded: ${scriptUrl}`);
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.onload = () => {
                console.log(`[ComponentLoader] Loaded script: ${scriptUrl}`);
                this.loadedScripts.add(scriptUrl);
                
                // Check if the component factory is now available
                if (window[`create${name}Component`]) {
                    const factory = window[`create${name}Component`];
                    this.registerComponent(name.toLowerCase(), factory);
                }
                
                resolve();
            };
            script.onerror = () => {
                console.error(`[ComponentLoader] Failed to load script: ${scriptUrl}`);
                reject(new Error(`Failed to load ${scriptUrl}`));
            };
            document.head.appendChild(script);
        });
    }
};

// Initialize immediately
window.ComponentLoader.init();

console.log('[ComponentLoader] Module loaded');
