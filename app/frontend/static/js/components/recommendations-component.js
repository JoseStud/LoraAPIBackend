/**
 * Refactored Recommendations Component
 * Uses mixins and API service for cleaner, more maintainable code
 */

function createRecommendationsComponent() {
    const baseComponent = window.AlpineMixins.createBaseComponent({
    // Explicitly declare local state to avoid relying on global fallbacks
    isLoading: false,
    loading: false,
    // Toast / notification state (explicit so templates don't reference globals)
    showToast: false,
    toastMessage: '',
    toastType: 'success',

    // Import/Export related (some pages reference these identifiers)
    exportConfig: {
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
    },
    importConfig: { mode: 'merge', conflict_resolution: 'ask', validate: true, backup_before: true, password: '' },
    isExporting: false,
    isImporting: false,
    estimatedSize: '0 MB',
    estimatedTime: '0 minutes',
    importFiles: [],
    importPreview: [],
    backupHistory: [],
    hasEncryptedFiles: false,
    showProgress: false,
    progressTitle: '',
    progressStep: '',
    progressPercent: 0,
    progressMessages: [],
    migrationProgress: { active: false, current_step: '', completed: 0, total: 100, status: 'idle', logs: [] },
        // Tab state
        activeTab: 'similarity',
        
        // Available LoRAs
        availableLoras: [],
        
        // Similarity explorer
        selectedLoraId: '',
        selectedLora: null,
        weights: {
            semantic: 0.6,
            artistic: 0.3,
            technical: 0.1
        },
        similarityLimit: 10,
        similarityThreshold: 0.1,
        
        // Prompt-based recommendations
        promptText: '',
        promptLimit: 10,
        promptIncludeInactive: false,
        promptSuggestions: [
            'anime girl with pink hair',
            'realistic portrait photography',
            'fantasy landscape with magic',
            'cyberpunk character design',
            'traditional art style',
            'watercolor painting effect',
            'detailed facial features',
            'medieval fantasy armor',
            'modern city background',
            'artistic lighting effects'
        ],
        
        // Embedding status
        computingEmbeddings: false,
        rebuildingIndex: false,
        embeddingProgress: 0,
        embeddingStatus: '',

        async customInit() {
            await this.loadAvailableLoras();
        // Mark component ready for template bindings
        this.isInitialized = true;
        },

        async loadAvailableLoras() {
            await this.withLoading(async () => {
                const data = await window.APIService.getAdapters({ limit: 1000 });
                this.availableLoras = data.items || [];
            }, 'loadAvailableLoras');
        },

        loadSelectedLora() {
            if (this.selectedLoraId) {
                this.selectedLora = this.availableLoras.find(lora => lora.id === this.selectedLoraId);
                this.updateRecommendations();
            }
        },

        updateRecommendations() {
            if (this.selectedLoraId) {
                document.body.dispatchEvent(new CustomEvent('similarity-search'));
            }
        },

        searchByPrompt() {
            if (this.promptText.trim()) {
                document.body.dispatchEvent(new CustomEvent('prompt-search'));
            }
        },

        resetWeights() {
            this.weights = {
                semantic: 0.6,
                artistic: 0.3,
                technical: 0.1
            };
            this.updateRecommendations();
        },

        async computeAllEmbeddings() {
            this.computingEmbeddings = true;
            this.embeddingProgress = 0;
            this.embeddingStatus = 'Starting embedding computation...';
            
            try {
                const loraIds = this.availableLoras.map(lora => lora.id);
                await window.APIService.computeEmbeddings(loraIds, false);
                
                this.embeddingStatus = 'Embeddings computed successfully!';
                this.embeddingProgress = 100;
                this.showSuccess('Embeddings computed successfully!');
            } catch (error) {
                this.embeddingStatus = 'Failed to compute embeddings';
                this.handleError(error, 'computeAllEmbeddings');
            } finally {
                setTimeout(() => {
                    this.computingEmbeddings = false;
                }, 2000);
            }
        },

        async rebuildIndex() {
            this.rebuildingIndex = true;
            this.embeddingProgress = 0;
            this.embeddingStatus = 'Rebuilding similarity index...';
            
            try {
                await window.APIService.rebuildIndex();
                
                this.embeddingStatus = 'Index rebuilt successfully!';
                this.embeddingProgress = 100;
                this.showSuccess('Index rebuilt successfully!');
            } catch (error) {
                this.embeddingStatus = 'Failed to rebuild index';
                this.handleError(error, 'rebuildIndex');
            } finally {
                setTimeout(() => {
                    this.rebuildingIndex = false;
                }, 2000);
            }
        },

        viewHealthReport() {
            window.open('/api/v1/recommendations/health', '_blank');
        }
    });

    return baseComponent;
}

// Export the component factory and register once with ComponentLoader
window.createRecommendationsComponent = createRecommendationsComponent;
if (window.ComponentLoader) {
    window.ComponentLoader.registerComponent('recommendationsData', createRecommendationsComponent);
} else {
    // Ensure the factory is available globally (no accidental space in property name)
    window.recommendationsData = createRecommendationsComponent;

    // If ComponentLoader appears later, register automatically
    const tryRegister = () => {
        if (window.ComponentLoader) {
            try {
                window.ComponentLoader.registerComponent('recommendationsData', createRecommendationsComponent);
            } catch (e) {
                window.DevLogger && window.DevLogger.warn && window.DevLogger.warn('[recommendations] deferred register failed', e);
            }
            return true;
        }
        return false;
    };

    if (!tryRegister()) {
        // Listen for ComponentLoader initialization
        const onLoader = () => { if (tryRegister()) { document.removeEventListener('componentloader:ready', onLoader); } };
        document.addEventListener('componentloader:ready', onLoader);

        // Also poll as a last resort
        const pollInterval = setInterval(() => { if (tryRegister()) clearInterval(pollInterval); }, 200);
    }
}
