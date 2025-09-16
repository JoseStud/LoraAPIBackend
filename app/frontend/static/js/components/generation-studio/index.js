/**
 * Generation Studio - Main Component Module
 * 
 * Integrates all generation studio modules into a unified Alpine.js component.
 */

/**
 * Creates the main generation studio Alpine.js component
 */
function generationStudio() {
    // Initialize state
    const state = window.generationState.createInitialState();
    
    // Initialize WebSocket connection manager
    const wsManager = window.generationWebSocket.createConnectionManager({
        onOpen: () => {
            window.generationState.setConnectionStatus(state, true);
            window.generationUI.toast.success('Connected to real-time updates');
        },
        
        onMessage: (messageInfo) => {
            handleWebSocketMessage(messageInfo);
        },
        
        onClose: () => {
            window.generationState.setConnectionStatus(state, false);
        },
        
        onError: (_error) => {
            window.generationUI.toast.error('Connection error: Real-time updates may be delayed');
        }
    });
    
    // Handle WebSocket messages
    function handleWebSocketMessage(messageInfo) {
        switch (messageInfo.type) {
            case 'generation_progress':
                handleProgressUpdate(messageInfo.payload);
                break;
            case 'generation_complete':
                handleGenerationComplete(messageInfo.payload);
                break;
            case 'generation_error':
                handleGenerationError(messageInfo.payload);
                break;
            case 'queue_update':
                handleQueueUpdate(messageInfo.payload);
                break;
            case 'system_status':
                handleSystemStatus(messageInfo.payload);
                break;
        }
    }
    
    // Handle progress updates
    function handleProgressUpdate(payload) {
        const job = window.generationState.getJobById(state, payload.jobId);
        if (job) {
            const updatedJob = window.generationProgress.updateJobProgress(job, payload);
            if (updatedJob) {
                window.generationState.updateActiveJob(state, payload.jobId, updatedJob);
            }
        }
    }
    
    // Handle generation completion
    function handleGenerationComplete(payload) {
        // Remove from active jobs
        window.generationState.removeActiveJob(state, payload.jobId);
        
        // Add to recent results
        window.generationState.addRecentResult(state, payload);
        
        window.generationUI.toast.success('Generation completed successfully');
    }
    
    // Handle generation errors
    function handleGenerationError(payload) {
        // Remove from active jobs
        window.generationState.removeActiveJob(state, payload.jobId);
        
        window.generationUI.toast.error(`Generation failed: ${payload.error}`);
    }
    
    // Handle queue updates
    function handleQueueUpdate(payload) {
        state.activeJobs = payload.jobs || [];
    }
    
    // Handle system status updates
    function handleSystemStatus(payload) {
        window.generationState.updateSystemStatus(state, payload.status);
    }
    
    return {
        // Expose state
        ...state,
        
        // Initialization
        async init() {
            try {
                // Load initial data
                await this.loadData();
                
                // Load parameters from URL
                const urlParams = window.generationUI.url.loadGenerationParams();
                if (Object.keys(urlParams).length > 0) {
                    window.generationState.updateParams(state, urlParams);
                    window.generationUI.toast.info('Parameters loaded from URL');
                }
                
                // Load user preferences
                const preferences = window.generationUI.storage.loadPreferences();
                if (preferences.autoSaveParams) {
                    this.setupAutoSave();
                }
                
                // Initialize WebSocket connection
                wsManager.connect();
                
                // Setup keyboard shortcuts
                this.setupKeyboardShortcuts();
                
                // Start polling as fallback
                this.startPolling();
                
                // Component ready for bindings
                this.isInitialized = true;
                
            } catch (error) {
                window.generationUI.toast.error('Failed to initialize Generation Studio');
            }
        },
        
        // Data loading methods
        async loadData() {
            const [systemResult, jobsResult, resultsResult] = await Promise.all([
                window.generationAPI.loadSystemStatus(),
                window.generationAPI.loadActiveJobs(),
                window.generationAPI.loadRecentResults(state.showHistory ? 50 : 10)
            ]);
            
            if (systemResult.success) {
                window.generationState.updateSystemStatus(state, systemResult.data);
            }
            
            if (jobsResult.success) {
                state.activeJobs = jobsResult.data;
            }
            
            if (resultsResult.success) {
                state.recentResults = resultsResult.data.map(result => 
                    window.generationResults.formatResult(result)
                );
            }
        },
        
        async refreshData() {
            await this.loadData();
            window.generationUI.toast.success('Data refreshed');
        },
        
        // Generation methods
        async startGeneration() {
            const validation = window.generationUI.validation.validatePrompt(state.params.prompt);
            if (!validation.isValid) {
                window.generationUI.toast.error(validation.errors[0]);
                return;
            }
            
            window.generationState.setGenerationStatus(state, true);
            
            try {
                const result = await window.generationAPI.startGeneration(state.params);
                
                if (result.success) {
                    // Add job to state
                    window.generationState.addActiveJob(state, {
                        id: result.data.job_id,
                        ...state.params,
                        status: result.data.status || 'queued'
                    });
                    
                    window.generationUI.toast.success('Generation started successfully');
                    
                    // Save parameters to URL if auto-save is enabled
                    const preferences = window.generationUI.storage.loadPreferences();
                    if (preferences.autoSaveParams) {
                        window.generationUI.url.saveGenerationParams(state.params);
                    }
                } else {
                    window.generationUI.toast.error(result.error || 'Generation failed');
                }
            } catch (error) {
                window.generationUI.toast.error('Error starting generation');
            } finally {
                window.generationState.setGenerationStatus(state, false);
            }
        },
        
        async cancelJob(jobId) {
            try {
                const result = await window.generationAPI.cancelJob(jobId);
                
                if (result.success) {
                    window.generationState.removeActiveJob(state, jobId);
                    window.generationUI.toast.success('Generation cancelled');
                } else {
                    window.generationUI.toast.error('Failed to cancel generation');
                }
            } catch (error) {
                window.generationUI.toast.error('Error cancelling generation');
            }
        },
        
        async clearQueue() {
            const queuedJobs = state.activeJobs.filter(job => job.status === 'queued');
            
            if (queuedJobs.length === 0) {
                window.generationUI.toast.info('No queued jobs to clear');
                return;
            }
            
            const confirmed = confirm(`Clear ${queuedJobs.length} queued job(s)?`);
            if (!confirmed) return;
            
            try {
                const promises = queuedJobs.map(job => this.cancelJob(job.id));
                await Promise.all(promises);
                window.generationUI.toast.success(`Cleared ${queuedJobs.length} queued jobs`);
            } catch (error) {
                window.generationUI.toast.error('Error clearing queue');
            }
        },
        
        // Result management methods
        showImageModal(result) {
            window.generationState.showResultModal(state, result);
        },
        
        hideImageModal() {
            window.generationState.hideResultModal(state);
        },
        
        reuseParameters(result) {
            const params = window.generationResults.extractParameters(result);
            if (params) {
                window.generationState.updateParams(state, params);
                window.generationUI.toast.success('Parameters loaded from result');
            }
        },
        
        async deleteResult(resultId) {
            const confirmed = confirm('Are you sure you want to delete this result?');
            if (!confirmed) return;
            
            try {
                const result = await window.generationAPI.deleteResult(resultId);
                
                if (result.success) {
                    window.generationState.removeRecentResult(state, resultId);
                    window.generationUI.toast.success('Result deleted');
                } else {
                    window.generationUI.toast.error('Failed to delete result');
                }
            } catch (error) {
                window.generationUI.toast.error('Error deleting result');
            }
        },
        
        async downloadResult(result) {
            try {
                const response = await window.generationAPI.downloadResult(result.id);
                
                if (response.success) {
                    window.generationUI.download.blob(response.data.blob, response.data.filename);
                    window.generationUI.toast.success('Download started');
                } else {
                    window.generationUI.toast.error('Download failed');
                }
            } catch (error) {
                window.generationUI.toast.error('Error downloading result');
            }
        },
        
        // Quick action methods
        useRandomPrompt() {
            const randomPrompt = window.generationUI.random.getPrompt();
            window.generationState.updateParams(state, { prompt: randomPrompt });
            window.generationUI.toast.success('Random prompt generated');
        },
        
        useRandomSeed() {
            const randomSeed = window.generationUI.random.getSeed();
            window.generationState.updateParams(state, { seed: randomSeed });
            window.generationUI.toast.success('Random seed generated');
        },
        
        saveAsPreset() {
            const name = prompt('Enter a name for this preset:');
            if (!name || !name.trim()) return;
            
            try {
                const preset = window.generationUI.storage.savePreset(name.trim(), state.params);
                window.generationUI.toast.success(`Preset "${preset.name}" saved`);
            } catch (error) {
                window.generationUI.toast.error('Failed to save preset');
            }
        },
        
        loadPreset(preset) {
            if (!preset || !preset.params) return;
            
            window.generationState.updateParams(state, preset.params);
            window.generationUI.toast.success(`Preset "${preset.name}" loaded`);
        },
        
        // UI utility methods
        toggleHistory() {
            const showHistory = window.generationState.toggleHistory(state);
            this.loadRecentResults(showHistory ? 50 : 10);
        },
        
        async copyPrompt(prompt) {
            const success = await window.generationUI.clipboard.copyText(prompt);
            if (success) {
                window.generationUI.toast.success('Prompt copied to clipboard');
            } else {
                window.generationUI.toast.error('Failed to copy prompt');
            }
        },
        
        async copyParameters(result) {
            const params = window.generationResults.extractParameters(result);
            const success = await window.generationUI.clipboard.copyParams(params);
            if (success) {
                window.generationUI.toast.success('Parameters copied to clipboard');
            } else {
                window.generationUI.toast.error('Failed to copy parameters');
            }
        },
        
        // Progress and status methods
        getJobProgress(job) {
            return window.generationProgress.getProgressBarConfig(job);
        },
        
        formatDuration(seconds) {
            return window.generationProgress.formatDuration(seconds);
        },
        
        formatFileSize(bytes) {
            return window.generationResults.formatFileSize(bytes);
        },
        
        formatDate(dateString) {
            return window.generationResults.formatDate(dateString);
        },
        
        getStatistics() {
            return window.generationState.getStatistics(state);
        },
        
        // Setup methods
        setupAutoSave() {
            // Save parameters to localStorage periodically
            setInterval(() => {
                window.generationUI.storage.set('lastParams', state.params);
            }, 30000); // Every 30 seconds
        },
        
        setupKeyboardShortcuts() {
            return window.generationUI.keyboard.init({
                startGeneration: () => this.startGeneration(),
                refreshResults: () => this.refreshData(),
                savePreset: () => this.saveAsPreset(),
                clearQueue: () => this.clearQueue(),
                randomPrompt: () => this.useRandomPrompt(),
                closeModal: () => this.hideImageModal()
            });
        },
        
        startPolling() {
            if (state.pollInterval) return;
            
            state.pollInterval = setInterval(async () => {
                if (state.activeJobs.length > 0 || !wsManager.isConnected()) {
                    const result = await window.generationAPI.loadActiveJobs();
                    if (result.success) {
                        state.activeJobs = result.data;
                    }
                }
            }, state.config.pollIntervalMs);
        },
        
        stopPolling() {
            if (state.pollInterval) {
                clearInterval(state.pollInterval);
                state.pollInterval = null;
            }
        },
        
        // Cleanup
        destroy() {
            this.stopPolling();
            wsManager.destroy();
            
            if (this.keyboardCleanup) {
                this.keyboardCleanup();
            }
        },
        
        // Alpine.js reactive getters
        get sortedActiveJobs() {
            return window.generationProgress.sortJobsByPriority(state.activeJobs);
        },
        
        get recentResultsDisplay() {
            return state.recentResults.slice(0, state.showHistory ? 50 : 10);
        },
        
        get systemHealth() {
            return window.generationState.isSystemHealthy(state);
        },
        
        get connectionStatus() {
            return wsManager.getStatus();
        },
        
        get hasActiveJobs() {
            return state.activeJobs.length > 0;
        },
        
        get hasRecentResults() {
            return state.recentResults.length > 0;
        },
        
        get canGenerate() {
            return !state.isGenerating && state.params.prompt.trim().length > 0;
        }
    };
}

export { generationStudio, generationStudio as createGenerationStudioComponent };

// Export for use in templates
if (typeof window !== 'undefined') {
    window.generationStudio = generationStudio;
}

// CommonJS export for Node/Jest
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationStudio, createGenerationStudioComponent: generationStudio };
}
