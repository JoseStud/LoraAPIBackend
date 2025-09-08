/**
 * Common Stub Factory for Alpine.js Components
 * 
 * Provides a centralized way to create stub components with safe defaults
 * for all common properties used across the LoRA Manager frontend.
 * 
 * This module is used by the component loader to create placeholder
 * components before real implementations are loaded.
 */

/**
 * Creates a common stub object with all typical properties and safe defaults.
 * 
 * @param {string} componentName - Name of the component (for debugging)
 * @returns {Object} Stub object with common properties and no-op methods
 */
function getCommonStub(componentName) {
    const stub = { 
        init() {
            // Default initialization - can be overridden by real components
        } 
    };

    // Basic UI state management
    stub.isLoading = false;
    stub.loading = false; // some templates reference `loading` directly
    stub.hasError = false;
    stub.errorMessage = '';

    // Data collections and selections
    stub.selectedLoras = [];
    stub.availableLoras = [];
    stub.availableTags = [];
    stub.selectedLoraId = '';
    stub.selectedLora = null;

    // Recommendation engine defaults
    stub.weights = { 
        semantic: 0.6, 
        artistic: 0.3, 
        technical: 0.1 
    };
    stub.similarityLimit = 10;
    stub.similarityThreshold = 0.1;

    // Prompt management
    stub.promptText = '';
    stub.promptLimit = 10;
    stub.promptIncludeInactive = false;
    stub.promptSuggestions = [];

    // Embedding and indexing state
    stub.embeddingProgress = 0;
    stub.embeddingStatus = '';
    stub.computingEmbeddings = false;
    stub.rebuildingIndex = false;

    // UI state and navigation
    stub.activeTab = 'default';
    stub.bulkMode = false;
    stub.viewMode = 'grid';
    stub.searchTerm = '';
    stub.showAllTags = false;
    stub.sortBy = 'created_at';

    // Filter configuration
    stub.filters = {
        activeOnly: false,
        hasEmbeddings: false,
        tags: [],
        sortBy: stub.sortBy
    };

    // Selection and bulk operations
    stub.selectedItems = [];
    stub.selectAll = false;
    stub.allSelected = false;

    // Results and pagination
    stub.results = [];
    stub.filteredResults = [];
    stub.currentPage = 1;
    stub.pageSize = 50;
    stub.hasMore = false;

    // Import/Export configuration
    stub.exportConfig = {
        loras: false,
        lora_files: false,
        lora_metadata: false,
        lora_embeddings: false,
        generations: false,
        generation_range: 'all',
        date_from: '',
        date_to: '',
        user_data: false,
        system_config: false,
        analytics: false,
        format: 'zip',
        compression: 'balanced',
        split_archives: false,
        max_size_mb: 1024,
        encrypt: false,
        password: ''
    };

    stub.importConfig = {
        mode: 'merge',
        conflict_resolution: 'ask',
        validate: true,
        backup_before: true,
        password: ''
    };

    stub.migrationConfig = {
        from_version: '',
        to_version: '',
        source_platform: '',
        source_path: ''
    };

    // Operation states
    stub.isExporting = false;
    stub.isImporting = false;
    stub.estimatedSize = '0 MB';
    stub.estimatedTime = '0 minutes';
    stub.importFiles = [];
    stub.importPreview = [];
    stub.backupHistory = [];
    stub.hasEncryptedFiles = false;

    // Progress tracking
    stub.showProgress = false;
    stub.progressTitle = '';
    stub.progressStep = '';
    stub.progressPercent = 0;
    stub.progressMessages = [];
    
    stub.migrationProgress = {
        active: false,
        current_step: '',
        completed: 0,
        total: 100,
        status: 'idle',
        logs: []
    };

    // Toast notifications
    stub.showToast = false;
    stub.toastMessage = '';
    stub.toastType = 'success';

    // System admin specific
    stub.systemStatus = {
        overall: 'healthy',
        last_check: new Date().toISOString()
    };

    stub.systemStats = {
        uptime: '0d 0h 0m',
        active_workers: 0,
        total_workers: 0,
        database_size: 0,
        total_records: 0,
        gpu_memory_used: '0GB',
        gpu_memory_total: '0GB'
    };

    stub.systemMetrics = {
        cpu_percent: 0,
        memory_percent: 0,
        memory_used: 0,
        disk_percent: 0,
        disk_used: 0,
        gpus: []
    };

    stub.workers = [];
    stub.dbStats = {
        total_loras: 0,
        total_generations: 0,
        database_size: 0
    };

    // Create no-op helper functions for common actions
    // Real components will override these with actual implementations
    const noOpMethods = [
        'loadAvailableLoras',
        'loadSelectedLora',
        'updateRecommendations',
        'searchByPrompt',
        'resetWeights',
        'computeAllEmbeddings',
        'rebuildIndex',
        'viewHealthReport',
        'loadBackupHistory',
        'updateEstimates',
        'canExport',
        'validateExport',
        'startExport',
        'startImport',
        'formatFileSize',
        'generateImportPreview',
        'showSuccess',
        'handleError',
        'refresh',
        'toggleTab',
        'selectItem',
        'clearSelection',
        'applyFilters',
        'resetFilters',
        'search',
        'loadMore',
        'save',
        'cancel',
        'close'
    ];

    // Add no-op methods to stub
    noOpMethods.forEach(methodName => {
        stub[methodName] = function(...args) {
            // Silent no-op - real component will override
            if (window.DevLogger && window.DevLogger.debug) {
                window.DevLogger.debug(`Stub method called: ${componentName}.${methodName}`, args);
            }
        };
    });

    return stub;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getCommonStub };
} else if (typeof window !== 'undefined') {
    window.getCommonStub = getCommonStub;
}
