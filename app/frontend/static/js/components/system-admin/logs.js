/**
 * System Administration Logs Module
 * 
 * Handles log loading, filtering, searching, and real-time monitoring
 * for the system administration component.
 */

/**
 * Logs manager for system administration
 */
class SystemLogsManager {
    constructor(api, showToast) {
        this.api = api;
        this.showToast = showToast;
        this.refreshInterval = null;
        this.isPolling = false;
    }

    /**
     * Load system logs
     * @param {Object} state - Component state object
     * @param {Object} options - Load options
     */
    async loadLogs(state, options = {}) {
        try {
            state.ui.loadingStates.logs = true;
            
            const logOptions = {
                limit: options.limit || 500,
                level: state.logs.logLevel !== 'all' ? state.logs.logLevel : undefined,
                source: state.logs.logSource !== 'all' ? state.logs.logSource : undefined
            };

            const logs = await this.api.getLogs(logOptions);
            
            // Replace logs completely on manual load
            state.logs.logs = logs;
            this.updateFilteredLogs(state);
            
            return logs;
            
        } catch (error) {
            this.handleError('Failed to load logs', error);
            this.showToast('Failed to load logs', 'error');
            throw error;
        } finally {
            state.ui.loadingStates.logs = false;
        }
    }

    /**
     * Start auto-refresh for logs
     * @param {Object} state - Component state object
     * @param {number} interval - Refresh interval in milliseconds
     */
    startAutoRefresh(state, interval = 10000) {
        this.stopAutoRefresh();
        
        state.logs.autoRefreshLogs = true;
        this.isPolling = true;
        
        this.refreshInterval = setInterval(async () => {
            if (state.logs.autoRefreshLogs) {
                await this.loadNewLogs(state);
            }
        }, interval);

        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug('Log auto-refresh started');
        }
    }

    /**
     * Stop auto-refresh for logs
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        this.isPolling = false;
    }

    /**
     * Load only new logs (for auto-refresh)
     * @param {Object} state - Component state object
     */
    async loadNewLogs(state) {
        try {
            const logOptions = {
                limit: 50, // Smaller batch for new logs
                level: state.logs.logLevel !== 'all' ? state.logs.logLevel : undefined,
                source: state.logs.logSource !== 'all' ? state.logs.logSource : undefined
            };

            const newLogs = await this.api.getLogs(logOptions);
            
            // Add only truly new logs
            if (newLogs && newLogs.length > 0) {
                const existingIds = new Set(state.logs.logs.map(log => log.id));
                const filteredNewLogs = newLogs.filter(log => !existingIds.has(log.id));
                
                if (filteredNewLogs.length > 0) {
                    // Add new logs to the beginning
                    state.logs.logs = [...filteredNewLogs, ...state.logs.logs]
                        .slice(0, state.logs.maxLogEntries);
                    
                    this.updateFilteredLogs(state);
                }
            }
            
        } catch (error) {
            this.handleError('Failed to load new logs', error);
        }
    }

    /**
     * Filter logs based on current filter settings
     * @param {Object} state - Component state object
     */
    updateFilteredLogs(state) {
        let filtered = [...state.logs.logs];

        // Filter by level (already filtered at API level, but double-check)
        if (state.logs.logLevel !== 'all') {
            filtered = filtered.filter(log => log.level === state.logs.logLevel);
        }

        // Filter by source (already filtered at API level, but double-check)
        if (state.logs.logSource !== 'all') {
            filtered = filtered.filter(log => log.source === state.logs.logSource);
        }

        // Filter by search term
        if (state.logs.searchTerm) {
            const term = state.logs.searchTerm.toLowerCase();
            filtered = filtered.filter(log =>
                log.message.toLowerCase().includes(term) ||
                log.source.toLowerCase().includes(term) ||
                (log.logger && log.logger.toLowerCase().includes(term))
            );
        }

        // Filter by date range
        if (state.logs.dateFilter.enabled) {
            filtered = filtered.filter(log => {
                const logDate = new Date(log.timestamp);
                const fromDate = state.logs.dateFilter.from ? new Date(state.logs.dateFilter.from) : null;
                const toDate = state.logs.dateFilter.to ? new Date(state.logs.dateFilter.to) : null;

                if (fromDate && logDate < fromDate) return false;
                if (toDate && logDate > toDate) return false;
                return true;
            });
        }

        state.logs.filteredLogs = filtered;
    }

    /**
     * Apply new filters and reload logs
     * @param {Object} state - Component state object
     * @param {Object} filters - New filter settings
     */
    async applyFilters(state, filters) {
        // Update filter state
        Object.assign(state.logs, filters);
        
        // Reload logs with new filters
        await this.loadLogs(state);
    }

    /**
     * Clear all filters
     * @param {Object} state - Component state object
     */
    clearFilters(state) {
        state.logs.logLevel = 'all';
        state.logs.logSource = 'all';
        state.logs.searchTerm = '';
        state.logs.dateFilter = {
            enabled: false,
            from: null,
            to: null
        };
        
        this.updateFilteredLogs(state);
    }

    /**
     * Search logs by term
     * @param {Object} state - Component state object
     * @param {string} searchTerm - Search term
     */
    searchLogs(state, searchTerm) {
        state.logs.searchTerm = searchTerm;
        this.updateFilteredLogs(state);
    }

    /**
     * Export logs to file
     * @param {Object} state - Component state object
     * @param {Object} options - Export options
     */
    exportLogs(state, options = {}) {
        try {
            const logs = options.filtered ? state.logs.filteredLogs : state.logs.logs;
            const format = options.format || 'json';
            
            let content;
            let filename;
            let mimeType;
            
            if (format === 'json') {
                content = JSON.stringify(logs, null, 2);
                filename = `system-logs-${new Date().toISOString().split('T')[0]}.json`;
                mimeType = 'application/json';
            } else if (format === 'csv') {
                content = this.convertLogsToCSV(logs);
                filename = `system-logs-${new Date().toISOString().split('T')[0]}.csv`;
                mimeType = 'text/csv';
            } else {
                content = this.convertLogsToText(logs);
                filename = `system-logs-${new Date().toISOString().split('T')[0]}.txt`;
                mimeType = 'text/plain';
            }
            
            this.downloadFile(content, filename, mimeType);
            this.showToast('Logs exported successfully', 'success');
            
        } catch (error) {
            this.handleError('Failed to export logs', error);
            this.showToast('Failed to export logs', 'error');
        }
    }

    /**
     * Convert logs to CSV format
     * @param {Array} logs - Log entries
     * @returns {string} CSV content
     */
    convertLogsToCSV(logs) {
        if (!logs || logs.length === 0) return '';
        
        const headers = ['timestamp', 'level', 'source', 'logger', 'message'];
        const csvRows = [headers.join(',')];
        
        logs.forEach(log => {
            const row = headers.map(header => {
                let value = log[header] || '';
                // Escape quotes and wrap in quotes if contains comma
                if (value.includes(',') || value.includes('"')) {
                    value = '"' + value.replace(/"/g, '""') + '"';
                }
                return value;
            });
            csvRows.push(row.join(','));
        });
        
        return csvRows.join('\n');
    }

    /**
     * Convert logs to plain text format
     * @param {Array} logs - Log entries
     * @returns {string} Text content
     */
    convertLogsToText(logs) {
        if (!logs || logs.length === 0) return 'No logs available';
        
        return logs.map(log => {
            const timestamp = new Date(log.timestamp).toISOString();
            const level = (log.level || 'INFO').toUpperCase().padEnd(5);
            const source = (log.source || 'unknown').padEnd(15);
            const logger = log.logger ? `[${log.logger}]` : '';
            const message = log.message || '';
            
            return `${timestamp} ${level} ${source} ${logger} ${message}`;
        }).join('\n');
    }

    /**
     * Download file content
     * @param {string} content - File content
     * @param {string} filename - Filename
     * @param {string} mimeType - MIME type
     */
    downloadFile(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        window.URL.revokeObjectURL(url);
    }

    /**
     * Get log statistics
     * @param {Array} logs - Log entries
     * @returns {Object} Log statistics
     */
    getLogStats(logs) {
        const stats = {
            total: logs.length,
            byLevel: {},
            bySource: {},
            timeRange: {
                oldest: null,
                newest: null
            }
        };

        logs.forEach(log => {
            // Count by level
            const level = log.level || 'unknown';
            stats.byLevel[level] = (stats.byLevel[level] || 0) + 1;
            
            // Count by source
            const source = log.source || 'unknown';
            stats.bySource[source] = (stats.bySource[source] || 0) + 1;
            
            // Track time range
            const timestamp = new Date(log.timestamp);
            if (!stats.timeRange.oldest || timestamp < stats.timeRange.oldest) {
                stats.timeRange.oldest = timestamp;
            }
            if (!stats.timeRange.newest || timestamp > stats.timeRange.newest) {
                stats.timeRange.newest = timestamp;
            }
        });

        return stats;
    }

    /**
     * Get unique log sources from current logs
     * @param {Array} logs - Log entries
     * @returns {Array} Array of unique sources
     */
    getLogSources(logs) {
        const sources = new Set();
        logs.forEach(log => {
            if (log.source) {
                sources.add(log.source);
            }
        });
        return Array.from(sources).sort();
    }

    /**
     * Get unique log levels from current logs
     * @param {Array} logs - Log entries
     * @returns {Array} Array of unique levels
     */
    getLogLevels(logs) {
        const levels = new Set();
        logs.forEach(log => {
            if (log.level) {
                levels.add(log.level);
            }
        });
        return Array.from(levels).sort();
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
    }
}

/**
 * Create a logs manager instance
 * @param {Object} api - API client instance
 * @param {Function} showToast - Toast notification function
 * @returns {SystemLogsManager} Logs manager instance
 */
function createLogsManager(api, showToast) {
    return new SystemLogsManager(api, showToast);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SystemLogsManager, createLogsManager };
} else if (typeof window !== 'undefined') {
    window.SystemLogsManager = SystemLogsManager;
    window.createLogsManager = createLogsManager;
}
