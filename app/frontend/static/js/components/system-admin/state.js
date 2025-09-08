/**
 * System Administration State Management
 * 
 * Provides initial state factories and state management utilities
 * for the system administration component.
 */

/**
 * Create initial system status state
 * @returns {Object} System status object
 */
function createSystemStatusState() {
    return {
        overall: 'healthy',
        last_check: new Date().toISOString(),
        services: {},
        uptime: 0,
        version: '1.0.0'
    };
}

/**
 * Create initial system statistics state
 * @returns {Object} System stats object
 */
function createSystemStatsState() {
    return {
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
    };
}

/**
 * Create initial system metrics state
 * @returns {Object} System metrics object
 */
function createSystemMetricsState() {
    return {
        cpu_percent: 0,
        memory_percent: 0,
        memory_used: 0,
        memory_total: 0,
        disk_percent: 0,
        disk_used: 0,
        disk_total: 0,
        network_io: {
            bytes_sent: 0,
            bytes_recv: 0
        },
        gpus: [],
        load_average: [0, 0, 0],
        processes: 0,
        threads: 0,
        timestamp: new Date().toISOString()
    };
}

/**
 * Create initial database stats state
 * @returns {Object} Database stats object
 */
function createDatabaseStatsState() {
    return {
        total_loras: 0,
        total_generations: 0,
        database_size: 0,
        table_sizes: {},
        index_sizes: {},
        connection_count: 0,
        query_cache_hit_ratio: 0,
        buffer_pool_usage: 0,
        last_backup: null,
        integrity_check: 'pending'
    };
}

/**
 * Create initial configuration state
 * @returns {Object} Configuration object
 */
function createConfigurationState() {
    return {
        max_concurrent_jobs: 4,
        generation_timeout: 30,
        cleanup_period: 30,
        log_level: 'INFO',
        gpu_memory_optimization: 'auto',
        precision_mode: 'fp16',
        enable_gpu_monitoring: true,
        max_storage_size: 100,
        image_quality: 'high',
        auto_backup: false,
        backup_retention_days: 30,
        enable_websockets: true,
        cors_origins: [],
        rate_limit: {
            enabled: true,
            requests_per_minute: 60
        },
        security: {
            require_auth: false,
            session_timeout: 3600
        }
    };
}

/**
 * Create initial logs state
 * @returns {Object} Logs state object
 */
function createLogsState() {
    return {
        logs: [],
        filteredLogs: [],
        logLevel: 'all',
        logSource: 'all',
        autoRefreshLogs: false,
        logRefreshInterval: null,
        maxLogEntries: 1000,
        searchTerm: '',
        dateFilter: {
            enabled: false,
            from: null,
            to: null
        }
    };
}

/**
 * Create initial backup state
 * @returns {Object} Backup state object
 */
function createBackupState() {
    return {
        recentBackups: [],
        isBackingUp: false,
        isOptimizing: false,
        backupProgress: 0,
        restoreProgress: 0,
        selectedBackup: null,
        backupConfig: {
            include_media: true,
            compress: true,
            encrypt: false,
            retention_count: 10
        }
    };
}

/**
 * Create initial UI state
 * @returns {Object} UI state object
 */
function createUIState() {
    return {
        activeTab: 'monitoring',
        isRefreshing: false,
        showMaintenance: false,
        showToast: false,
        toastMessage: '',
        toastType: 'success',
        maintenanceMessage: '',
        confirmDialog: {
            show: false,
            title: '',
            message: '',
            confirmCallback: null,
            cancelCallback: null
        },
        loadingStates: {
            system: false,
            workers: false,
            database: false,
            logs: false,
            backups: false,
            config: false
        }
    };
}

/**
 * Create initial workers state
 * @returns {Object} Workers state object
 */
function createWorkersState() {
    return {
        workers: [],
        workerStats: {
            total: 0,
            active: 0,
            idle: 0,
            error: 0
        },
        selectedWorker: null,
        workerHistory: {},
        autoRefresh: true,
        refreshInterval: 5000
    };
}

/**
 * Create complete initial state for system admin component
 * @returns {Object} Complete initial state
 */
function createSystemAdminState() {
    return {
        // Core data states
        systemStatus: createSystemStatusState(),
        systemStats: createSystemStatsState(),
        systemMetrics: createSystemMetricsState(),
        dbStats: createDatabaseStatsState(),
        config: createConfigurationState(),
        workers: createWorkersState(),
        
        // Feature states
        logs: createLogsState(),
        backup: createBackupState(),
        
        // UI states
        ui: createUIState(),
        
        // Computed properties helpers
        get healthyWorkers() {
            return this.workers.workers.filter(w => w.status === 'active').length;
        },
        
        get errorWorkers() {
            return this.workers.workers.filter(w => w.status === 'error').length;
        },
        
        get systemHealth() {
            const metrics = this.systemMetrics;
            if (metrics.cpu_percent > 90 || metrics.memory_percent > 95) {
                return 'critical';
            } else if (metrics.cpu_percent > 70 || metrics.memory_percent > 80) {
                return 'warning';
            }
            return 'healthy';
        },
        
        get filteredLogEntries() {
            let filtered = this.logs.logs;
            
            // Filter by level
            if (this.logs.logLevel !== 'all') {
                filtered = filtered.filter(log => log.level === this.logs.logLevel);
            }
            
            // Filter by source
            if (this.logs.logSource !== 'all') {
                filtered = filtered.filter(log => log.source === this.logs.logSource);
            }
            
            // Filter by search term
            if (this.logs.searchTerm) {
                const term = this.logs.searchTerm.toLowerCase();
                filtered = filtered.filter(log => 
                    log.message.toLowerCase().includes(term) ||
                    log.source.toLowerCase().includes(term)
                );
            }
            
            // Filter by date range
            if (this.logs.dateFilter.enabled) {
                filtered = filtered.filter(log => {
                    const logDate = new Date(log.timestamp);
                    const fromDate = this.logs.dateFilter.from ? new Date(this.logs.dateFilter.from) : null;
                    const toDate = this.logs.dateFilter.to ? new Date(this.logs.dateFilter.to) : null;
                    
                    if (fromDate && logDate < fromDate) return false;
                    if (toDate && logDate > toDate) return false;
                    return true;
                });
            }
            
            return filtered;
        }
    };
}

/**
 * State update utilities
 */
const StateUpdaters = {
    /**
     * Update system status safely
     * @param {Object} state - Current state
     * @param {Object} newStatus - New status data
     */
    updateSystemStatus(state, newStatus) {
        Object.assign(state.systemStatus, {
            ...newStatus,
            last_check: new Date().toISOString()
        });
    },

    /**
     * Update system metrics safely
     * @param {Object} state - Current state
     * @param {Object} newMetrics - New metrics data
     */
    updateSystemMetrics(state, newMetrics) {
        Object.assign(state.systemMetrics, {
            ...newMetrics,
            timestamp: new Date().toISOString()
        });
    },

    /**
     * Update workers list safely
     * @param {Object} state - Current state
     * @param {Array} newWorkers - New workers data
     */
    updateWorkers(state, newWorkers) {
        state.workers.workers = newWorkers;
        state.workers.workerStats = {
            total: newWorkers.length,
            active: newWorkers.filter(w => w.status === 'active').length,
            idle: newWorkers.filter(w => w.status === 'idle').length,
            error: newWorkers.filter(w => w.status === 'error').length
        };
    },

    /**
     * Add new log entries
     * @param {Object} state - Current state
     * @param {Array} newLogs - New log entries
     */
    addLogEntries(state, newLogs) {
        state.logs.logs = [...newLogs, ...state.logs.logs]
            .slice(0, state.logs.maxLogEntries);
    },

    /**
     * Update loading state for a specific component
     * @param {Object} state - Current state
     * @param {string} component - Component name
     * @param {boolean} isLoading - Loading state
     */
    setLoadingState(state, component, isLoading) {
        if (Object.prototype.hasOwnProperty.call(state.ui.loadingStates, component)) {
            state.ui.loadingStates[component] = isLoading;
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createSystemAdminState,
        createSystemStatusState,
        createSystemStatsState,
        createSystemMetricsState,
        createDatabaseStatsState,
        createConfigurationState,
        createLogsState,
        createBackupState,
        createUIState,
        createWorkersState,
        StateUpdaters
    };
} else if (typeof window !== 'undefined') {
    window.SystemAdminState = {
        createSystemAdminState,
        createSystemStatusState,
        createSystemStatsState,
        createSystemMetricsState,
        createDatabaseStatsState,
        createConfigurationState,
        createLogsState,
        createBackupState,
        createUIState,
        createWorkersState,
        StateUpdaters
    };
}
