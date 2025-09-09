/**
 * System Administration Component - Main Entry Point
 * 
 * This is the main Alpine.js component factory that combines all system admin modules:
 * - API client for backend communication
 * - State management and initial state
 * - Metrics polling and monitoring
 * - Backup and database operations
 * - Logs management and filtering
 */

/**
 * System Administration Alpine.js Component Factory
 * @returns {Object} Alpine.js component configuration
 */
function systemAdmin() {
    // Create state using factory
    const state = window.SystemAdminState ? 
        window.SystemAdminState.createSystemAdminState() : 
        createFallbackState();

    // Initialize managers
    const api = window.systemAdminAPI || createFallbackAPI();
    const stateUpdater = window.SystemAdminState ? 
        window.SystemAdminState.StateUpdaters : 
        createFallbackStateUpdater();

    const metricsManager = window.createMetricsManager ? 
        window.createMetricsManager(api, stateUpdater) : 
        null;

    // Toast notification helper
    function showToast(message, type = 'success') {
        state.ui.showToast = true;
        state.ui.toastMessage = message;
        state.ui.toastType = type;
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            state.ui.showToast = false;
        }, 5000);
    }

    return {
        // Expose state properties at root level for Alpine templates
        ...state,

        /**
         * Initialize the component
         */
        async init() {
            try {
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('Initializing System Admin component');
                }

                // Load initial system data
                await this.loadSystemData();
                
                // Start real-time updates
                this.startRealTimeUpdates();
                
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('System Admin component initialized successfully');
                }
                // Mark component ready for template bindings
                this.isInitialized = true;
            } catch (error) {
                this.handleError('Failed to initialize system admin', error);
            }
        },

        /**
         * Load all system data with improved error handling
         */
        async loadSystemData() {
            const loadingOperations = [
                { name: 'systemStatus', promise: this.loadSystemStatus() },
                { name: 'systemStats', promise: this.loadSystemStats() },
                { name: 'systemMetrics', promise: this.loadSystemMetrics() },
                { name: 'workers', promise: this.loadWorkers() },
                { name: 'databaseStats', promise: this.loadDatabaseStats() },
                { name: 'configuration', promise: this.loadConfiguration() }
            ];

            try {
                const results = await Promise.allSettled(loadingOperations.map(op => op.promise));
                
                // Handle individual results
                results.forEach((result, index) => {
                    const operationName = loadingOperations[index].name;
                    
                    if (result.status === 'fulfilled') {
                        if (window.DevLogger && window.DevLogger.debug) {
                            window.DevLogger.debug(`Successfully loaded ${operationName}`);
                        }
                    } else {
                        // Handle individual failures gracefully
                        if (window.DevLogger && window.DevLogger.error) {
                            window.DevLogger.error(`Failed to load ${operationName}:`, result.reason);
                        }
                        this.handlePartialFailure(operationName, result.reason);
                    }
                });
                
                // Check if any critical operations failed
                const criticalOperations = ['systemStatus', 'systemStats'];
                const criticalFailures = results
                    .map((result, index) => ({ result, name: loadingOperations[index].name }))
                    .filter(({ result, name }) => result.status === 'rejected' && criticalOperations.includes(name));
                
                if (criticalFailures.length > 0) {
                    this.handleCriticalFailures(criticalFailures);
                } else {
                    // All critical operations succeeded
                    this.isInitialized = true;
                }
                
            } catch (error) {
                // This should rarely happen with Promise.allSettled, but handle it just in case
                this.handleError('Unexpected error loading system data', error);
            }
        },

        /**
         * Handle partial failure of a single operation
         * @param {string} operationName - Name of the failed operation
         * @param {Error} error - The error that occurred
         */
        handlePartialFailure(operationName, error) {
            // Set fallback data for failed operations
            switch (operationName) {
                case 'systemStatus':
                    this.systemStatus.overall = 'unknown';
                    this.systemStatus.message = 'Status unavailable';
                    break;
                case 'systemStats':
                    this.systemStats = {
                        uptime: 'Unknown',
                        memory_usage: 'Unknown',
                        cpu_usage: 'Unknown'
                    };
                    break;
                case 'systemMetrics':
                    this.metrics = { current: {}, historical: [] };
                    break;
                case 'workers':
                    this.workers = [];
                    break;
                case 'databaseStats':
                    this.databaseStats = { connections: 'Unknown', size: 'Unknown' };
                    break;
                case 'configuration':
                    this.configuration = {};
                    break;
            }
            
            // Show a user-friendly message
            showToast(`Some ${operationName} data is temporarily unavailable`, 'warning');
        },

        /**
         * Handle critical failures that prevent proper initialization
         * @param {Array} failures - Array of critical failures
         */
        handleCriticalFailures(failures) {
            const failedOperations = failures.map(f => f.name).join(', ');
            this.handleError(`Critical system operations failed: ${failedOperations}`, failures[0].result.reason);
            
            // Set component to error state but don't completely break
            this.systemStatus.overall = 'error';
            this.systemStatus.message = 'System monitoring partially unavailable';
        },

        /**
         * Start real-time updates using metrics manager
         */
        startRealTimeUpdates() {
            if (metricsManager) {
                metricsManager.startPolling(this);
            } else {
                // Fallback to simple polling
                this.startFallbackPolling();
            }
        },

        /**
         * Stop real-time updates
         */
        stopRealTimeUpdates() {
            console.log('[SystemAdmin] Stopping real-time updates');
            
            // Stop metrics manager polling
            if (metricsManager) {
                metricsManager.stopPolling();
                console.log('[SystemAdmin] Metrics manager polling stopped');
            }
            
            // Also stop fallback polling if active
            if (this.fallbackInterval) {
                clearInterval(this.fallbackInterval);
                this.fallbackInterval = null;
                console.log('[SystemAdmin] Fallback polling stopped');
            }
            
            // Reset polling state
            this.isPolling = false;
        },

        // System Status Methods
        /**
         * Load system status
         */
        async loadSystemStatus() {
            try {
                const status = await api.getSystemStatus();
                stateUpdater.updateSystemStatus(this, status);
            } catch (error) {
                this.handleError('Failed to load system status', error);
                this.systemStatus.overall = 'error';
            }
        },

        /**
         * Load system statistics
         */
        async loadSystemStats() {
            try {
                const stats = await api.getSystemStats();
                Object.assign(this.systemStats, stats);
            } catch (error) {
                this.handleError('Failed to load system stats', error);
            }
        },

        /**
         * Load system metrics
         */
        async loadSystemMetrics() {
            try {
                const metrics = await api.getSystemMetrics();
                stateUpdater.updateSystemMetrics(this, metrics);
            } catch (error) {
                this.handleError('Failed to load system metrics', error);
            }
        },

        /**
         * Load database statistics
         */
        async loadDatabaseStats() {
            try {
                const dbStats = await api.getDatabaseStats();
                Object.assign(this.dbStats, dbStats);
            } catch (error) {
                this.handleError('Failed to load database stats', error);
            }
        },

        /**
         * Load system configuration
         */
        async loadConfiguration() {
            try {
                const config = await api.getConfiguration();
                Object.assign(this.config, config);
            } catch (error) {
                this.handleError('Failed to load configuration', error);
            }
        },

        // Workers Management
        /**
         * Load workers information
         */
        async loadWorkers() {
            try {
                const workers = await api.getWorkers();
                stateUpdater.updateWorkers(this, workers);
            } catch (error) {
                this.handleError('Failed to load workers', error);
            }
        },

        /**
         * Start or stop all workers
         */
        async controlWorkers(action) {
            try {
                await api.controlWorkers(action);
                await this.loadWorkers();
                showToast(`Workers ${action} command sent`, 'success');
            } catch (error) {
                this.handleError(`Failed to ${action} workers`, error);
                showToast(`Failed to ${action} workers`, 'error');
            }
        },

        /**
         * Restart all workers
         */
        async restartAllWorkers() {
            try {
                await api.restartAllWorkers();
                await this.loadWorkers();
                showToast('All workers restart initiated', 'success');
            } catch (error) {
                this.handleError('Failed to restart workers', error);
                showToast('Failed to restart workers', 'error');
            }
        },

        /**
         * Restart specific worker
         */
        async restartWorker(workerId) {
            try {
                await api.restartWorker(workerId);
                await this.loadWorkers();
                showToast(`Worker ${workerId} restart initiated`, 'success');
            } catch (error) {
                this.handleError(`Failed to restart worker ${workerId}`, error);
                showToast(`Failed to restart worker ${workerId}`, 'error');
            }
        },

        /**
         * Stop specific worker
         */
        async stopWorker(workerId) {
            try {
                await api.stopWorker(workerId);
                await this.loadWorkers();
                showToast(`Worker ${workerId} stopped`, 'success');
            } catch (error) {
                this.handleError(`Failed to stop worker ${workerId}`, error);
                showToast(`Failed to stop worker ${workerId}`, 'error');
            }
        },

        // Configuration Management
        /**
         * Update system configuration
         */
        async updateConfiguration() {
            try {
                await api.updateConfiguration(this.config);
                showToast('Configuration updated successfully', 'success');
            } catch (error) {
                this.handleError('Failed to update configuration', error);
                showToast('Failed to update configuration', 'error');
            }
        },

        // UI Methods
        /**
         * Change active tab
         */
        changeTab(tab) {
            this.ui.activeTab = tab;
        },

        /**
         * Toggle maintenance mode
         */
        toggleMaintenance() {
            this.ui.showMaintenance = !this.ui.showMaintenance;
        },

        /**
         * Manual refresh of all data
         */
        async refresh() {
            this.ui.isRefreshing = true;
            try {
                await this.loadSystemData();
                showToast('System data refreshed', 'success');
            } catch (error) {
                this.handleError('Failed to refresh data', error);
                showToast('Failed to refresh data', 'error');
            } finally {
                this.ui.isRefreshing = false;
            }
        },

        // Utility Methods
        /**
         * Handle errors consistently
         */
        handleError(message, error) {
            if (window.DevLogger && window.DevLogger.error) {
                window.DevLogger.error(message, error);
            }
            
            this.ui.hasError = true;
            this.ui.errorMessage = message;
        },

        /**
         * Format file size for display
         */
        formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        /**
         * Format size for display (alias for formatFileSize for template compatibility)
         */
        formatSize(bytes) {
            return this.formatFileSize(bytes);
        },

        /**
         * Get health assessment
         */
        getHealthAssessment() {
            if (metricsManager && metricsManager.getHealthAssessment) {
                return metricsManager.getHealthAssessment(this);
            }
            return { overall: 'unknown', issues: [], warnings: [], score: 0 };
        },

        /**
         * Fallback polling for when metrics manager is not available
         */
        startFallbackPolling() {
            // Prevent creating multiple intervals
            if (this.fallbackInterval) {
                console.log('[SystemAdmin] Fallback polling already active, skipping setup');
                return;
            }

            console.log('[SystemAdmin] Starting fallback polling every 30 seconds');
            
            this.fallbackInterval = setInterval(async () => {
                // ✅ Check the guard before running
                if (this.isPolling) {
                    console.log('[SystemAdmin] Polling in progress, skipping new request');
                    return;
                }

                try {
                    this.isPolling = true; // ✅ Set the guard
                    console.log('[SystemAdmin] Starting background data refresh');
                    
                    await this.loadSystemMetrics();
                    await this.loadWorkers();
                    
                    console.log('[SystemAdmin] Background data refresh completed');
                } catch (error) {
                    // Log the error for debugging purposes instead of silently handling
                    console.error('[SystemAdmin] Fallback poll failed:', error);
                } finally {
                    this.isPolling = false; // ✅ Always release the guard
                }
            }, 30000);
        },

        /**
         * ✅ Cleanup intervals and resources on component destruction
         * This is crucial for preventing memory leaks
         */
        destroy() {
            console.log('[SystemAdmin] Component destroying, cleaning up resources');
            
            // ✅ Stop fallback polling interval
            if (this.fallbackInterval) {
                clearInterval(this.fallbackInterval);
                this.fallbackInterval = null;
                console.log('[SystemAdmin] Fallback polling interval cleared');
            }
            
            // ✅ Reset polling state
            this.isPolling = false;
            
            // Stop metrics manager if available
            if (metricsManager && metricsManager.stop) {
                metricsManager.stop();
                console.log('[SystemAdmin] Metrics manager stopped');
            }
            
            // Stop logs auto-refresh if active
            if (this.logs.logRefreshInterval) {
                clearInterval(this.logs.logRefreshInterval);
                this.logs.logRefreshInterval = null;
                console.log('[SystemAdmin] Logs auto-refresh stopped');
            }
            
            console.log('[SystemAdmin] Component cleanup completed');
        }
    };
}

/**
 * Create fallback state when state module is not available
 */
function createFallbackState() {
    return window.getCommonStub ? window.getCommonStub('systemAdmin') : {
        init() {},
        isInitialized: false,
        isPolling: false, // ✅ Guard to prevent overlapping requests
        fallbackInterval: null, // ✅ Track the interval ID
        ui: { activeTab: 'monitoring', isRefreshing: false },
        systemStatus: { overall: 'unknown' },
        systemStats: {
            uptime: '0d 0h 0m',
            active_workers: 0,
            total_workers: 0,
            database_size: 0,
            total_records: 0,
            gpu_memory_used: '0GB',
            gpu_memory_total: '0GB',
            storage_used: 0,
            storage_total: 0,
            active_connections: 0,
            total_requests: 0,
            last_updated: new Date().toISOString()
        },
        systemMetrics: {
            cpu_percent: 0,
            memory_percent: 0,
            memory_used: 0,
            memory_total: 0,
            disk_percent: 0,
            disk_used: 0,
            disk_total: 0
        },
        workers: { workers: [] },
        dbStats: {
            total_loras: 0,
            total_generations: 0,
            database_size: 0
        },
        config: {},
        logs: { logs: [], autoRefreshLogs: false },
        backup: { recentBackups: [] }
    };
}

/**
 * Create fallback API when API module is not available
 */
function createFallbackAPI() {
    const fallback = {
        async getSystemStatus() { return { overall: 'unknown' }; },
        async getSystemStats() { return {}; },
        async getSystemMetrics() { return {}; },
        async getWorkers() { return []; },
        async getDatabaseStats() { return {}; },
        async getConfiguration() { return {}; },
        async getLogs() { return []; },
        async getRecentBackups() { return []; }
    };
    
    // Add all other API methods as no-ops
    return new Proxy(fallback, {
        get(target, prop) {
            if (target[prop]) {
                return target[prop];
            }
            return async () => {
                throw new Error(`API method ${prop} not available in fallback mode`);
            };
        }
    });
}

/**
 * Create fallback state updater
 */
function createFallbackStateUpdater() {
    return {
        updateSystemStatus(state, status) { Object.assign(state.systemStatus, status); },
        updateSystemMetrics(state, metrics) { Object.assign(state.systemMetrics, metrics); },
        updateWorkers(state, workers) { state.workers.workers = workers; },
        setLoadingState() { /* no-op */ }
    };
}

// Make the component available globally
if (typeof window !== 'undefined') {
    window.systemAdmin = systemAdmin;
}

// ES Module export for Vite
export function createSystemAdminComponent() {
    return systemAdmin();
}

// Backward compatibility export
export { systemAdmin };

// Module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { systemAdmin };
}
