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

    const backupManager = window.createBackupManager ? 
        window.createBackupManager(api, showToast) : 
        null;

    const logsManager = window.createLogsManager ? 
        window.createLogsManager(api, showToast) : 
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
            } catch (error) {
                this.handleError('Failed to initialize system admin', error);
            }
        },

        /**
         * Load all system data
         */
        async loadSystemData() {
            const loadingPromises = [
                this.loadSystemStatus(),
                this.loadSystemStats(),
                this.loadSystemMetrics(),
                this.loadWorkers(),
                this.loadDatabaseStats(),
                this.loadConfiguration(),
                this.loadLogs(),
                this.loadRecentBackups()
            ];

            try {
                await Promise.allSettled(loadingPromises);
            } catch (error) {
                this.handleError('Error loading system data', error);
            }
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
            if (metricsManager) {
                metricsManager.stopPolling();
            }
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

        // Backup and Database Operations
        /**
         * Load recent backups
         */
        async loadRecentBackups() {
            if (backupManager) {
                try {
                    await backupManager.loadBackupHistory(this);
                } catch (error) {
                    this.handleError('Failed to load backup history', error);
                }
            }
        },

        /**
         * Create database backup
         */
        async createBackup() {
            if (backupManager) {
                try {
                    await backupManager.createBackup(this);
                } catch (error) {
                    this.handleError('Failed to create backup', error);
                }
            } else {
                showToast('Backup manager not available', 'error');
            }
        },

        /**
         * Restore from backup
         */
        async restoreBackup(backupId) {
            if (backupManager) {
                try {
                    await backupManager.restoreBackup(this, backupId);
                } catch (error) {
                    this.handleError('Failed to restore backup', error);
                }
            } else {
                showToast('Backup manager not available', 'error');
            }
        },

        /**
         * Download backup file
         */
        async downloadBackup(backupId) {
            if (backupManager) {
                try {
                    await backupManager.downloadBackup(this, backupId);
                } catch (error) {
                    this.handleError('Failed to download backup', error);
                }
            } else {
                showToast('Backup manager not available', 'error');
            }
        },

        /**
         * Delete backup
         */
        async deleteBackup(backupId) {
            if (backupManager) {
                try {
                    await backupManager.deleteBackup(this, backupId);
                } catch (error) {
                    this.handleError('Failed to delete backup', error);
                }
            } else {
                showToast('Backup manager not available', 'error');
            }
        },

        /**
         * Optimize database
         */
        async optimizeDatabase() {
            if (backupManager) {
                try {
                    await backupManager.optimizeDatabase(this);
                } catch (error) {
                    this.handleError('Failed to optimize database', error);
                }
            } else {
                showToast('Backup manager not available', 'error');
            }
        },

        // Logs Management
        /**
         * Load system logs
         */
        async loadLogs() {
            if (logsManager) {
                try {
                    await logsManager.loadLogs(this);
                } catch (error) {
                    this.handleError('Failed to load logs', error);
                }
            }
        },

        /**
         * Toggle log auto-refresh
         */
        toggleLogAutoRefresh() {
            if (logsManager) {
                if (this.logs.autoRefreshLogs) {
                    logsManager.stopAutoRefresh();
                    this.logs.autoRefreshLogs = false;
                    showToast('Log auto-refresh disabled', 'info');
                } else {
                    logsManager.startAutoRefresh(this);
                    this.logs.autoRefreshLogs = true;
                    showToast('Log auto-refresh enabled', 'info');
                }
            }
        },

        /**
         * Filter logs
         */
        async filterLogs() {
            if (logsManager) {
                await logsManager.applyFilters(this, {
                    logLevel: this.logs.logLevel,
                    logSource: this.logs.logSource,
                    searchTerm: this.logs.searchTerm
                });
            }
        },

        /**
         * Clear log filters
         */
        clearLogFilters() {
            if (logsManager) {
                logsManager.clearFilters(this);
            }
        },

        /**
         * Export logs
         */
        exportLogs(format = 'json') {
            if (logsManager) {
                logsManager.exportLogs(this, { format, filtered: true });
            } else {
                showToast('Logs manager not available', 'error');
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
            if (backupManager && backupManager.formatFileSize) {
                return backupManager.formatFileSize(bytes);
            }
            
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
            // Simple polling every 30 seconds
            setInterval(async () => {
                try {
                    await this.loadSystemMetrics();
                    await this.loadWorkers();
                } catch (error) {
                    // Silently handle errors in background polling
                }
            }, 30000);
        }
    };
}

/**
 * Create fallback state when state module is not available
 */
function createFallbackState() {
    return window.getCommonStub ? window.getCommonStub('systemAdmin') : {
        init() {},
        ui: { activeTab: 'monitoring', isRefreshing: false },
        systemStatus: { overall: 'unknown' },
        systemStats: {},
        systemMetrics: {},
        workers: { workers: [] },
        dbStats: {},
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

// Module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { systemAdmin };
}
