/**
 * Import/Export Component - State Management Module
 * 
 * Handles all state-related functionality for the import/export component
 * including configuration management and UI state.
 */

/**
 * Creates the initial state for import/export component
 */
function createImportExportState() {
    return {
        // Tab State
        activeTab: 'export',
        
        // Export Configuration
        exportConfig: {
            loras: true,
            lora_files: true,
            lora_metadata: true,
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
        
        // Import Configuration
        importConfig: {
            mode: 'merge',
            conflict_resolution: 'ask',
            validate: true,
            backup_before: true,
            password: ''
        },
        
        // Migration Configuration
        migrationConfig: {
            from_version: '2.0',
            to_version: '2.1',
            source_platform: 'automatic1111',
            source_path: ''
        },
        
        // Operation State
        isExporting: false,
        isImporting: false,
        isMigrating: false,
        
        // Progress Tracking
        showProgress: false,
        progressValue: 0,
        currentStep: '',
        progressMessages: [],
        
        // Estimation State
        estimatedSize: '0 MB',
        estimatedTime: '0 minutes',
        
        // Import State
        importFiles: [],
        importPreview: [],
        hasEncryptedFiles: false,
        
        // Migration State
        migrationPreview: [],
        
        // UI State
        showToast: false,
        toastMessage: '',
        toastType: 'info'
    };
}

/**
 * State mutation methods
 */
const importExportState = {
    /**
     * Updates export configuration
     */
    updateExportConfig(state, updates) {
        Object.assign(state.exportConfig, updates);
        return state;
    },
    
    /**
     * Updates import configuration
     */
    updateImportConfig(state, updates) {
        Object.assign(state.importConfig, updates);
        return state;
    },
    
    /**
     * Updates migration configuration
     */
    updateMigrationConfig(state, updates) {
        Object.assign(state.migrationConfig, updates);
        return state;
    },
    
    /**
     * Sets operation state
     */
    setOperationState(state, { operation, isActive }) {
        const operationKey = `is${operation.charAt(0).toUpperCase() + operation.slice(1)}`;
        state[operationKey] = isActive;
        
        if (isActive) {
            // Reset other operations
            ['isExporting', 'isImporting', 'isMigrating'].forEach(key => {
                if (key !== operationKey) {
                    state[key] = false;
                }
            });
        }
        
        return state;
    },
    
    /**
     * Updates progress state
     */
    updateProgress(state, { value, step, message }) {
        if (value !== undefined) state.progressValue = value;
        if (step !== undefined) state.currentStep = step;
        if (message !== undefined) {
            state.progressMessages.push({
                id: Date.now(),
                text: `[${new Date().toLocaleTimeString()}] ${message}`
            });
        }
        return state;
    },
    
    /**
     * Shows/hides progress dialog
     */
    setProgressVisibility(state, visible) {
        state.showProgress = visible;
        if (!visible) {
            state.progressValue = 0;
            state.currentStep = '';
            state.progressMessages = [];
        }
        return state;
    },
    
    /**
     * Updates import files
     */
    setImportFiles(state, files) {
        state.importFiles = [...files];
        state.hasEncryptedFiles = files.some(file => 
            file.name.includes('encrypted') || file.name.includes('password')
        );
        return state;
    },
    
    /**
     * Removes an import file
     */
    removeImportFile(state, fileToRemove) {
        state.importFiles = state.importFiles.filter(file => file !== fileToRemove);
        if (state.importFiles.length === 0) {
            state.importPreview = [];
            state.hasEncryptedFiles = false;
        }
        return state;
    },
    
    /**
     * Sets import preview data
     */
    setImportPreview(state, preview) {
        state.importPreview = [...preview];
        return state;
    },
    
    /**
     * Updates size and time estimates
     */
    setEstimates(state, { size, time }) {
        if (size !== undefined) state.estimatedSize = size;
        if (time !== undefined) state.estimatedTime = time;
        return state;
    },
    
    /**
     * Shows toast message
     */
    showToast(state, { message, type = 'info' }) {
        state.toastMessage = message;
        state.toastType = type;
        state.showToast = true;
        return state;
    },
    
    /**
     * Hides toast message
     */
    hideToast(state) {
        state.showToast = false;
        return state;
    },
    
    /**
     * Switches active tab
     */
    setActiveTab(state, tab) {
        state.activeTab = tab;
        return state;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createImportExportState, importExportState };
} else if (typeof window !== 'undefined') {
    window.createImportExportState = createImportExportState;
    window.importExportState = importExportState;
}
