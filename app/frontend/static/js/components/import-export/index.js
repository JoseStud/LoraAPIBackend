/**
 * Import/Export Component - Main Module
 * 
 * Main component that combines all import/export functionality
 * using the modular architecture pattern.
 */

/**
 * Main Import/Export Alpine.js component factory
 */
function importExport() {
    // Initialize state using state module
    const state = window.createImportExportState ? window.createImportExportState() : {};
    
    return {
        // Spread state properties
        ...state,
        
        // Initialization
        init() {
            this.updateEstimates();
            this.setupWatchers();
            
            // Set up auto-hide for toast messages
            this.$watch('showToast', (value) => {
                if (value) {
                    setTimeout(() => {
                        this.showToast = false;
                    }, 3000);
                }
            });
            // Component ready for bindings
            this.isInitialized = true;
        },
        
        // Set up reactive watchers
        setupWatchers() {
            this.$watch('exportConfig', () => {
                this.updateEstimates();
            }, { deep: true });
        },
        
        // Export Operations
        updateEstimates() {
            if (window.exportOperations) {
                const estimates = window.exportOperations.calculateEstimates(this.exportConfig);
                this.estimatedSize = estimates.size;
                this.estimatedTime = estimates.time;
            }
        },
        
        canExport() {
            return window.exportOperations ? 
                window.exportOperations.canExport(this.exportConfig) : false;
        },
        
        validateExport() {
            if (!window.exportOperations) return [];
            return window.exportOperations.validateExportConfig(this.exportConfig);
        },
        
        async startExport() {
            if (!window.exportOperations) {
                this.showToastMessage('Export functionality not available', 'error');
                return;
            }
            
            try {
                this.isExporting = true;
                this.showProgress = true;
                
                const downloadUrl = await window.exportOperations.startExport(
                    this.exportConfig,
                    (progress) => this.updateProgressDisplay(progress)
                );
                
                this.showToastMessage('Export completed successfully', 'success');
                
                // Trigger download
                if (window.importExportUI) {
                    const filename = `lora_export_${new Date().toISOString().slice(0, 10)}.${this.exportConfig.format}`;
                    window.importExportUI.triggerDownload(downloadUrl, filename);
                }
                
            } catch (error) {
                this.showToastMessage(`Export failed: ${error.message}`, 'error');
            } finally {
                this.isExporting = false;
                this.showProgress = false;
            }
        },
        
        // Import Operations
        handleFileDrop(event) {
            if (!window.importOperations) return;
            
            const newFiles = window.importOperations.handleFileDrop(event, this.importFiles);
            this.importFiles = newFiles;
            
            if (window.importOperations.detectEncryptedFiles(newFiles)) {
                this.hasEncryptedFiles = true;
            }
        },
        
        handleFileSelect(event) {
            if (!window.importOperations) return;
            
            const newFiles = window.importOperations.handleFileSelect(event, this.importFiles);
            this.importFiles = newFiles;
            
            const validCount = newFiles.length - this.importFiles.length;
            if (validCount < event.target.files.length) {
                this.showToastMessage('Some files were skipped (unsupported format)', 'warning');
            }
        },
        
        removeFile(fileToRemove) {
            this.importFiles = this.importFiles.filter(file => file !== fileToRemove);
            if (this.importFiles.length === 0) {
                this.importPreview = [];
                this.hasEncryptedFiles = false;
            }
        },
        
        async analyzeFiles() {
            if (!window.importOperations || this.importFiles.length === 0) return;
            
            try {
                this.showToastMessage('Analyzing import files...', 'info');
                
                const preview = await window.importOperations.analyzeImportFiles(this.importFiles);
                this.importPreview = preview;
                
                this.showToastMessage('File analysis completed', 'success');
            } catch (error) {
                this.showToastMessage(`Analysis failed: ${error.message}`, 'error');
            }
        },
        
        validateImport() {
            if (!window.importOperations) return [];
            return window.importOperations.validateImportOperation(this.importConfig, this.importFiles);
        },
        
        async startImport() {
            if (!window.importOperations) {
                this.showToastMessage('Import functionality not available', 'error');
                return;
            }
            
            try {
                this.isImporting = true;
                this.showProgress = true;
                
                const result = await window.importOperations.startImport(
                    this.importConfig,
                    this.importFiles,
                    (progress) => this.updateProgressDisplay(progress)
                );
                
                this.showToastMessage(`Import completed: ${result.imported} files processed`, 'success');
                this.importFiles = [];
                this.importPreview = [];
                
            } catch (error) {
                this.showToastMessage(`Import failed: ${error.message}`, 'error');
            } finally {
                this.isImporting = false;
                this.showProgress = false;
            }
        },
        
        // Migration Operations
        async analyzeMigration() {
            if (!window.migrationOperations) {
                this.showToastMessage('Migration functionality not available', 'error');
                return;
            }
            
            try {
                this.showToastMessage('Analyzing migration source...', 'info');
                
                const preview = await window.migrationOperations.analyzeMigrationSource(this.migrationConfig);
                this.migrationPreview = preview.items;
                
                this.showToastMessage('Migration analysis completed', 'success');
            } catch (error) {
                this.showToastMessage(`Migration analysis failed: ${error.message}`, 'error');
            }
        },
        
        async startMigration() {
            if (!window.migrationOperations) {
                this.showToastMessage('Migration functionality not available', 'error');
                return;
            }
            
            try {
                this.isMigrating = true;
                this.showProgress = true;
                
                const result = await window.migrationOperations.startMigration(
                    this.migrationConfig,
                    (progress) => this.updateProgressDisplay(progress)
                );
                
                this.showToastMessage(`Migration completed: ${result.migrated} items migrated`, 'success');
                this.migrationPreview = [];
                
            } catch (error) {
                this.showToastMessage(`Migration failed: ${error.message}`, 'error');
            } finally {
                this.isMigrating = false;
                this.showProgress = false;
            }
        },
        
        // Progress and UI Operations
        updateProgressDisplay(progress) {
            if (window.importExportUI) {
                window.importExportUI.updateProgress(this, progress);
            } else {
                // Fallback implementation
                if (progress.value !== undefined) this.progressValue = progress.value;
                if (progress.step !== undefined) this.currentStep = progress.step;
                if (progress.message !== undefined) {
                    this.progressMessages.push({
                        id: Date.now(),
                        text: `[${new Date().toLocaleTimeString()}] ${progress.message}`
                    });
                }
            }
        },
        
        cancelOperation() {
            this.isExporting = false;
            this.isImporting = false;
            this.isMigrating = false;
            this.showProgress = false;
            this.showToastMessage('Operation cancelled', 'warning');
        },
        
        // UI Utilities
        formatFileSize(bytes) {
            return window.importExportUI ? 
                window.importExportUI.formatFileSize(bytes) : 
                `${Math.round(bytes / 1024)} KB`;
        },
        
        formatDate(dateString) {
            return window.importExportUI ? 
                window.importExportUI.formatDate(dateString) : 
                new Date(dateString).toLocaleString();
        },
        
        showToastMessage(message, type = 'info') {
            if (window.importExportUI) {
                window.importExportUI.showToast(this, message, type);
            } else {
                // Fallback implementation
                this.toastMessage = message;
                this.toastType = type;
                this.showToast = true;
            }
        },
        
        getStatusClasses(status) {
            return window.importExportUI ? 
                window.importExportUI.getStatusClasses(status) : 
                'bg-gray-100 text-gray-800';
        },
        
        getTypeIcon(type) {
            return window.importExportUI ? 
                window.importExportUI.getTypeIcon(type) : 
                '📄';
        },
        
        // Drag and Drop handlers
        handleDragOver(event) {
            if (window.importExportUI) {
                window.importExportUI.handleDragOver(event);
            } else {
                event.preventDefault();
            }
        },
        
        handleDragLeave(event) {
            if (window.importExportUI) {
                window.importExportUI.handleDragLeave(event);
            }
        },
        
        // Navigation
        viewHistory() {
            this.activeTab = 'backup';
        }
    };
}

// Register with Alpine.js or make globally available
if (typeof Alpine !== 'undefined') {
    Alpine.data('importExport', importExport);
} else if (typeof window !== 'undefined') {
    window.importExport = importExport;
}

// CommonJS export for Node/Jest and back-compat
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { importExport, createImportExportComponent: importExport };
}
