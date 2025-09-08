/**
 * System Administration Metrics Module
 * 
 * Handles metrics polling, status monitoring, and real-time updates
 * for the system administration component.
 */

/**
 * Metrics manager for system administration
 */
class SystemMetricsManager {
    constructor(api, stateUpdater) {
        this.api = api;
        this.stateUpdater = stateUpdater;
        this.intervals = new Map();
        this.isRunning = false;
        this.pollingConfig = {
            metrics: 5000,      // 5 seconds
            stats: 30000,       // 30 seconds
            workers: 5000,      // 5 seconds
            logs: 10000,        // 10 seconds (if auto-refresh enabled)
            status: 60000       // 1 minute
        };
    }

    /**
     * Start all metric polling
     * @param {Object} state - Component state object
     */
    startPolling(state) {
        if (this.isRunning) {
            this.stopPolling();
        }

        this.isRunning = true;

        // Start system metrics polling
        this.intervals.set('metrics', setInterval(async () => {
            await this.updateMetrics(state);
        }, this.pollingConfig.metrics));

        // Start system stats polling
        this.intervals.set('stats', setInterval(async () => {
            await this.updateStats(state);
        }, this.pollingConfig.stats));

        // Start workers polling
        this.intervals.set('workers', setInterval(async () => {
            await this.updateWorkers(state);
        }, this.pollingConfig.workers));

        // Start status polling
        this.intervals.set('status', setInterval(async () => {
            await this.updateStatus(state);
        }, this.pollingConfig.status));

        // Start logs polling if auto-refresh is enabled
        if (state.logs && state.logs.autoRefreshLogs) {
            this.startLogsPolling(state);
        }

        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug('System metrics polling started');
        }
    }

    /**
     * Stop all metric polling
     */
    stopPolling() {
        this.intervals.forEach((interval, name) => {
            clearInterval(interval);
            if (window.DevLogger && window.DevLogger.debug) {
                window.DevLogger.debug(`Stopped polling: ${name}`);
            }
        });
        this.intervals.clear();
        this.isRunning = false;
    }

    /**
     * Start logs polling specifically
     * @param {Object} state - Component state object
     */
    startLogsPolling(state) {
        if (this.intervals.has('logs')) {
            clearInterval(this.intervals.get('logs'));
        }

        this.intervals.set('logs', setInterval(async () => {
            await this.updateLogs(state);
        }, this.pollingConfig.logs));
    }

    /**
     * Stop logs polling specifically
     */
    stopLogsPolling() {
        if (this.intervals.has('logs')) {
            clearInterval(this.intervals.get('logs'));
            this.intervals.delete('logs');
        }
    }

    /**
     * Update system metrics
     * @param {Object} state - Component state object
     */
    async updateMetrics(state) {
        try {
            this.stateUpdater.setLoadingState(state, 'system', true);
            const metrics = await this.api.getSystemMetrics();
            this.stateUpdater.updateSystemMetrics(state, metrics);
        } catch (error) {
            this.handleError('Failed to update system metrics', error);
        } finally {
            this.stateUpdater.setLoadingState(state, 'system', false);
        }
    }

    /**
     * Update system statistics
     * @param {Object} state - Component state object
     */
    async updateStats(state) {
        try {
            const stats = await this.api.getSystemStats();
            Object.assign(state.systemStats, stats);
            
            // Also update database stats
            const dbStats = await this.api.getDatabaseStats();
            Object.assign(state.dbStats, dbStats);
        } catch (error) {
            this.handleError('Failed to update system stats', error);
        }
    }

    /**
     * Update system status
     * @param {Object} state - Component state object
     */
    async updateStatus(state) {
        try {
            const status = await this.api.getSystemStatus();
            this.stateUpdater.updateSystemStatus(state, status);
        } catch (error) {
            this.handleError('Failed to update system status', error);
            // Set status to error if we can't reach the API
            state.systemStatus.overall = 'error';
            state.systemStatus.last_check = new Date().toISOString();
        }
    }

    /**
     * Update workers information
     * @param {Object} state - Component state object
     */
    async updateWorkers(state) {
        try {
            this.stateUpdater.setLoadingState(state, 'workers', true);
            const workers = await this.api.getWorkers();
            this.stateUpdater.updateWorkers(state, workers);
        } catch (error) {
            this.handleError('Failed to update workers', error);
        } finally {
            this.stateUpdater.setLoadingState(state, 'workers', false);
        }
    }

    /**
     * Update logs
     * @param {Object} state - Component state object
     */
    async updateLogs(state) {
        try {
            const options = {
                limit: 100, // Get recent logs
                level: state.logs.logLevel,
                source: state.logs.logSource
            };
            
            const newLogs = await this.api.getLogs(options);
            
            // Only add truly new logs to avoid duplicates
            const existingIds = new Set(state.logs.logs.map(log => log.id));
            const filteredNewLogs = newLogs.filter(log => !existingIds.has(log.id));
            
            if (filteredNewLogs.length > 0) {
                this.stateUpdater.addLogEntries(state, filteredNewLogs);
            }
        } catch (error) {
            this.handleError('Failed to update logs', error);
        }
    }

    /**
     * Get health assessment based on current metrics
     * @param {Object} state - Component state object
     * @returns {Object} Health assessment
     */
    getHealthAssessment(state) {
        const metrics = state.systemMetrics;
        const workers = state.workers;
        const assessment = {
            overall: 'healthy',
            issues: [],
            warnings: [],
            score: 100
        };

        // Check CPU usage
        if (metrics.cpu_percent > 90) {
            assessment.issues.push('High CPU usage detected');
            assessment.score -= 20;
        } else if (metrics.cpu_percent > 70) {
            assessment.warnings.push('Elevated CPU usage');
            assessment.score -= 10;
        }

        // Check memory usage
        if (metrics.memory_percent > 95) {
            assessment.issues.push('Critical memory usage');
            assessment.score -= 25;
        } else if (metrics.memory_percent > 80) {
            assessment.warnings.push('High memory usage');
            assessment.score -= 10;
        }

        // Check disk usage
        if (metrics.disk_percent > 95) {
            assessment.issues.push('Disk space critically low');
            assessment.score -= 25;
        } else if (metrics.disk_percent > 85) {
            assessment.warnings.push('Disk space running low');
            assessment.score -= 10;
        }

        // Check workers
        const errorWorkers = workers.workers.filter(w => w.status === 'error').length;
        if (errorWorkers > 0) {
            assessment.issues.push(`${errorWorkers} worker(s) in error state`);
            assessment.score -= (errorWorkers * 10);
        }

        const idleWorkers = workers.workers.filter(w => w.status === 'idle').length;
        if (idleWorkers === workers.workers.length && workers.workers.length > 0) {
            assessment.warnings.push('All workers are idle');
            assessment.score -= 5;
        }

        // Determine overall status
        if (assessment.score < 60) {
            assessment.overall = 'critical';
        } else if (assessment.score < 80 || assessment.issues.length > 0) {
            assessment.overall = 'warning';
        }

        return assessment;
    }

    /**
     * Get performance trends
     * @param {Object} state - Component state object
     * @returns {Object} Performance trends data
     */
    getPerformanceTrends(state) {
        // This would typically store historical data
        // For now, return current snapshot
        const metrics = state.systemMetrics;
        
        return {
            cpu: {
                current: metrics.cpu_percent,
                trend: 'stable', // would be calculated from history
                peak: metrics.cpu_percent
            },
            memory: {
                current: metrics.memory_percent,
                trend: 'stable',
                peak: metrics.memory_percent
            },
            workers: {
                active: state.workers.workerStats.active,
                total: state.workers.workerStats.total,
                efficiency: state.workers.workerStats.active / Math.max(state.workers.workerStats.total, 1)
            }
        };
    }

    /**
     * Configure polling intervals
     * @param {Object} config - Configuration object
     */
    configurePolling(config) {
        Object.assign(this.pollingConfig, config);
        
        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug('Polling configuration updated:', this.pollingConfig);
        }
    }

    /**
     * Handle errors consistently
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    handleError(message, error) {
        if (window.DevLogger && window.DevLogger.error) {
            window.DevLogger.error(message, error);
        }
        
        // Could emit events here for toast notifications
        if (typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('systemMetricsError', {
                detail: { message, error }
            }));
        }
    }
}

/**
 * Create a metrics manager instance
 * @param {Object} api - API client instance
 * @param {Object} stateUpdater - State updater utilities
 * @returns {SystemMetricsManager} Metrics manager instance
 */
function createMetricsManager(api, stateUpdater) {
    return new SystemMetricsManager(api, stateUpdater);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SystemMetricsManager, createMetricsManager };
} else if (typeof window !== 'undefined') {
    window.SystemMetricsManager = SystemMetricsManager;
    window.createMetricsManager = createMetricsManager;
}
