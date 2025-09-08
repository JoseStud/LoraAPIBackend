/**
 * Generation Studio - State Management Module
 * 
 * Handles state initialization and management for the generation studio component.
 */

/**
 * Creates and manages state for the generation studio
 */
const generationState = {
    /**
     * Creates initial state
     */
    createInitialState() {
        return {
            // Generation Parameters
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
            
            // Core State
            activeJobs: [],
            recentResults: [],
            systemStatus: {},
            
            // UI State
            isGenerating: false,
            showHistory: false,
            showModal: false,
            selectedResult: null,
            showToast: false,
            toastMessage: '',
            
            // Network State
            websocket: null,
            pollInterval: null,
            isConnected: false,
            
            // Configuration
            config: {
                pollIntervalMs: 2000,
                maxRecentResults: 50,
                toastDuration: 3000,
                maxRetries: 3
            }
        };
    },
    
    /**
     * Updates generation parameters
     */
    updateParams(state, newParams) {
        const validParams = this.validateParams(newParams);
        state.params = { ...state.params, ...validParams };
        return state;
    },
    
    /**
     * Validates generation parameters
     */
    validateParams(params) {
        const validated = {};
        
        if (params.prompt !== undefined) {
            validated.prompt = String(params.prompt).trim();
        }
        
        if (params.negative_prompt !== undefined) {
            validated.negative_prompt = String(params.negative_prompt).trim();
        }
        
        if (params.width !== undefined) {
            const width = Number(params.width);
            validated.width = width >= 64 && width <= 2048 ? width : 512;
        }
        
        if (params.height !== undefined) {
            const height = Number(params.height);
            validated.height = height >= 64 && height <= 2048 ? height : 512;
        }
        
        if (params.steps !== undefined) {
            const steps = Number(params.steps);
            validated.steps = steps >= 1 && steps <= 150 ? steps : 20;
        }
        
        if (params.cfg_scale !== undefined) {
            const cfg = Number(params.cfg_scale);
            validated.cfg_scale = cfg >= 1 && cfg <= 30 ? cfg : 7.0;
        }
        
        if (params.seed !== undefined) {
            const seed = Number(params.seed);
            validated.seed = Number.isInteger(seed) ? seed : -1;
        }
        
        if (params.batch_count !== undefined) {
            const count = Number(params.batch_count);
            validated.batch_count = count >= 1 && count <= 10 ? count : 1;
        }
        
        if (params.batch_size !== undefined) {
            const size = Number(params.batch_size);
            validated.batch_size = size >= 1 && size <= 4 ? size : 1;
        }
        
        return validated;
    },
    
    /**
     * Adds a new job to active jobs
     */
    addActiveJob(state, jobData) {
        const newJob = {
            id: jobData.id || Date.now().toString(),
            prompt: jobData.prompt || state.params.prompt,
            negative_prompt: jobData.negative_prompt || state.params.negative_prompt,
            width: jobData.width || state.params.width,
            height: jobData.height || state.params.height,
            steps: jobData.steps || state.params.steps,
            cfg_scale: jobData.cfg_scale || state.params.cfg_scale,
            seed: jobData.seed || state.params.seed,
            batch_count: jobData.batch_count || state.params.batch_count,
            batch_size: jobData.batch_size || state.params.batch_size,
            status: jobData.status || 'queued',
            progress: jobData.progress || 0,
            current_step: 0,
            total_steps: jobData.steps || state.params.steps,
            created_at: jobData.created_at || new Date().toISOString(),
            start_time: null,
            eta: null
        };
        
        state.activeJobs.unshift(newJob);
        return newJob;
    },
    
    /**
     * Updates an active job
     */
    updateActiveJob(state, jobId, updates) {
        const jobIndex = state.activeJobs.findIndex(job => job.id === jobId);
        if (jobIndex !== -1) {
            state.activeJobs[jobIndex] = { ...state.activeJobs[jobIndex], ...updates };
            return state.activeJobs[jobIndex];
        }
        return null;
    },
    
    /**
     * Removes a job from active jobs
     */
    removeActiveJob(state, jobId) {
        const initialLength = state.activeJobs.length;
        state.activeJobs = state.activeJobs.filter(job => job.id !== jobId);
        return state.activeJobs.length !== initialLength;
    },
    
    /**
     * Adds a result to recent results
     */
    addRecentResult(state, resultData) {
        const newResult = {
            id: resultData.id || Date.now().toString(),
            job_id: resultData.job_id,
            prompt: resultData.prompt,
            negative_prompt: resultData.negative_prompt,
            image_url: resultData.image_url,
            thumbnail_url: resultData.thumbnail_url,
            width: resultData.width,
            height: resultData.height,
            steps: resultData.steps,
            cfg_scale: resultData.cfg_scale,
            seed: resultData.seed,
            batch_count: resultData.batch_count,
            batch_size: resultData.batch_size,
            created_at: resultData.created_at || new Date().toISOString(),
            file_size: resultData.file_size,
            generation_time: resultData.generation_time,
            model_used: resultData.model_used
        };
        
        state.recentResults.unshift(newResult);
        
        // Limit the number of results kept in memory
        const maxResults = state.showHistory ? state.config.maxRecentResults : 10;
        if (state.recentResults.length > maxResults) {
            state.recentResults = state.recentResults.slice(0, maxResults);
        }
        
        return newResult;
    },
    
    /**
     * Removes a result from recent results
     */
    removeRecentResult(state, resultId) {
        const initialLength = state.recentResults.length;
        state.recentResults = state.recentResults.filter(result => result.id !== resultId);
        return state.recentResults.length !== initialLength;
    },
    
    /**
     * Updates system status
     */
    updateSystemStatus(state, statusData) {
        state.systemStatus = {
            ...state.systemStatus,
            ...statusData,
            last_updated: Date.now()
        };
        return state.systemStatus;
    },
    
    /**
     * Sets generation status
     */
    setGenerationStatus(state, isGenerating) {
        state.isGenerating = Boolean(isGenerating);
        return state.isGenerating;
    },
    
    /**
     * Sets connection status
     */
    setConnectionStatus(state, isConnected) {
        state.isConnected = Boolean(isConnected);
        return state.isConnected;
    },
    
    /**
     * Shows toast notification
     */
    showToast(state, message, type = 'success') {
        state.toastMessage = String(message);
        state.showToast = true;
        
        // Auto-hide after configured duration
        setTimeout(() => {
            state.showToast = false;
            state.toastMessage = '';
        }, state.config.toastDuration);
        
        return { message, type };
    },
    
    /**
     * Hides toast notification
     */
    hideToast(state) {
        state.showToast = false;
        state.toastMessage = '';
        return state;
    },
    
    /**
     * Shows result modal
     */
    showResultModal(state, result) {
        state.selectedResult = result;
        state.showModal = true;
        return state;
    },
    
    /**
     * Hides result modal
     */
    hideResultModal(state) {
        state.selectedResult = null;
        state.showModal = false;
        return state;
    },
    
    /**
     * Toggles history view
     */
    toggleHistory(state) {
        state.showHistory = !state.showHistory;
        return state.showHistory;
    },
    
    /**
     * Gets job by ID
     */
    getJobById(state, jobId) {
        return state.activeJobs.find(job => job.id === jobId) || null;
    },
    
    /**
     * Gets result by ID
     */
    getResultById(state, resultId) {
        return state.recentResults.find(result => result.id === resultId) || null;
    },
    
    /**
     * Gets generation statistics
     */
    getStatistics(state) {
        const totalJobs = state.activeJobs.length;
        const processingJobs = state.activeJobs.filter(job => job.status === 'processing').length;
        const queuedJobs = state.activeJobs.filter(job => job.status === 'queued').length;
        const completedToday = state.recentResults.filter(result => {
            const today = new Date().toDateString();
            const resultDate = new Date(result.created_at).toDateString();
            return today === resultDate;
        }).length;
        
        return {
            totalActiveJobs: totalJobs,
            processingJobs,
            queuedJobs,
            completedToday,
            totalResults: state.recentResults.length,
            isSystemHealthy: this.isSystemHealthy(state),
            averageGenerationTime: this.calculateAverageGenerationTime(state)
        };
    },
    
    /**
     * Checks if system is healthy
     */
    isSystemHealthy(state) {
        const now = Date.now();
        const lastUpdate = state.systemStatus.last_updated || 0;
        const timeSinceUpdate = now - lastUpdate;
        
        // Consider system healthy if:
        // - Last update was within 30 seconds
        // - No stuck jobs (processing for more than 10 minutes)
        // - Connection is active
        
        const isRecent = timeSinceUpdate < 30000;
        const hasStuckJobs = state.activeJobs.some(job => {
            if (job.status === 'processing' && job.start_time) {
                const processingTime = now - job.start_time;
                return processingTime > 600000; // 10 minutes
            }
            return false;
        });
        
        return isRecent && !hasStuckJobs && state.isConnected;
    },
    
    /**
     * Calculates average generation time
     */
    calculateAverageGenerationTime(state) {
        const resultsWithTime = state.recentResults.filter(result => result.generation_time);
        
        if (resultsWithTime.length === 0) return 0;
        
        const totalTime = resultsWithTime.reduce((sum, result) => sum + result.generation_time, 0);
        return totalTime / resultsWithTime.length;
    },
    
    /**
     * Clears all state (for cleanup)
     */
    clearState(state) {
        Object.assign(state, this.createInitialState());
        return state;
    },
    
    /**
     * Exports state for persistence
     */
    exportState(state) {
        return {
            params: state.params,
            recentResults: state.recentResults.slice(0, 10), // Only export recent 10
            config: state.config,
            timestamp: Date.now()
        };
    },
    
    /**
     * Imports state from persistence
     */
    importState(state, importedData) {
        if (importedData.params) {
            state.params = { ...state.params, ...this.validateParams(importedData.params) };
        }
        
        if (Array.isArray(importedData.recentResults)) {
            state.recentResults = importedData.recentResults;
        }
        
        if (importedData.config) {
            state.config = { ...state.config, ...importedData.config };
        }
        
        return state;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationState };
} else if (typeof window !== 'undefined') {
    window.generationState = generationState;
}
