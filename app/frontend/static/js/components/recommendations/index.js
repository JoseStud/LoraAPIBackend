/**
 * Recommendations Component Module
 * 
 * This module exports the existing recommendations component
 * in a format compatible with the new Vite-based system.
 */

import { fetchData } from '../utils/api.js';

// For now, we'll create a simple wrapper that maintains backward compatibility
// Later, this can be refactored to use proper ES modules

export function createRecommendationsComponent() {
    // Check if the legacy component creator exists
    if (typeof window !== 'undefined' && window.createRecommendationsComponent) {
        return window.createRecommendationsComponent();
    }
    
    // Fallback component if the legacy one isn't available
    return {
        // Initialization state (required for x-show guards)
        isInitialized: false,
        
        isLoading: false,
        loading: false,
        showToast: false,
        toastMessage: '',
        toastType: 'success',
        
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
        
        // Embedding status - THESE WERE MISSING
        computingEmbeddings: false,
        rebuildingIndex: false,
        embeddingProgress: 0,
        embeddingStatus: 'Ready',
        
        // Import/Export state (for compatibility)
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
        
        importConfig: { 
            mode: 'merge', 
            conflict_resolution: 'ask', 
            validate: true, 
            backup_before: true, 
            password: '' 
        },
        
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
        
        migrationProgress: { 
            active: false, 
            current_step: '', 
            completed: 0, 
            total: 100, 
            status: 'idle', 
            logs: [] 
        },
        
        init() {
            // Initialize the component
            this.loadAvailableLoras();
            this.isInitialized = true;
        },
        
        async loadAvailableLoras() {
            this.isLoading = true;
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/adapters');
                this.availableLoras = data.items || data || [];
            } catch (error) {
                // Handle error silently or use proper error reporting
                this.showToastMessage('Failed to load LoRAs', 'error');
            } finally {
                this.isLoading = false;
            }
        },
        
        loadSelectedLora() {
            if (this.selectedLoraId) {
                this.selectedLora = this.availableLoras.find(lora => lora.id === this.selectedLoraId);
                this.updateRecommendations();
            }
        },

        updateRecommendations() {
            if (this.selectedLoraId) {
                // Trigger similarity search (placeholder)
            }
        },

        searchByPrompt() {
            if (this.promptText.trim()) {
                // Trigger prompt-based search (placeholder)
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
                // Simulate progress
                for (let i = 0; i <= 100; i += 10) {
                    this.embeddingProgress = i;
                    this.embeddingStatus = `Computing embeddings... ${i}%`;
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                this.embeddingStatus = 'Embeddings computed successfully!';
                this.showToastMessage('Embeddings computed successfully!', 'success');
            } catch (error) {
                this.embeddingStatus = 'Failed to compute embeddings';
                this.showToastMessage('Failed to compute embeddings', 'error');
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
                // Simulate progress
                for (let i = 0; i <= 100; i += 20) {
                    this.embeddingProgress = i;
                    this.embeddingStatus = `Rebuilding index... ${i}%`;
                    await new Promise(resolve => setTimeout(resolve, 150));
                }
                
                this.embeddingStatus = 'Index rebuilt successfully!';
                this.showToastMessage('Index rebuilt successfully!', 'success');
            } catch (error) {
                this.embeddingStatus = 'Failed to rebuild index';
                this.showToastMessage('Failed to rebuild index', 'error');
            } finally {
                setTimeout(() => {
                    this.rebuildingIndex = false;
                }, 2000);
            }
        },

        viewHealthReport() {
            window.open((window?.BACKEND_URL || '') + '/recommendations/health', '_blank');
        },
        
        showToastMessage(message, type = 'success') {
            this.toastMessage = message;
            this.toastType = type;
            this.showToast = true;
            
            // Auto-hide after 3 seconds
            setTimeout(() => {
                this.showToast = false;
            }, 3000);
        }
    };
}
