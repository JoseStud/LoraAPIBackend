/**
 * Log Viewer Component for System Admin
 * 
 * Handles all log viewing, filtering, and management functionality
 */

export function createLogViewerComponent() {
    return {
        // State
        logs: [],
        filteredLogs: [],
        logLevel: 'all',
        logSource: 'all',
        autoRefreshLogs: false,
        
        // Internal state
        autoRefreshInterval: null,
        api: null,

        init() {
            // Initialize API if available
            this.api = window.systemAdminAPI || this.createFallbackAPI();
            
            // Load initial logs
            this.loadLogs();
            
            if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('📋 Log Viewer Initialized');
            }
        },

        createFallbackAPI() {
            return {
                getLogs: async () => {
                    if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        console.log('Fallback: Getting logs...');
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Return sample logs
                    const now = Date.now();
                    return {
                        success: true,
                        logs: [
                            {
                                id: 1,
                                timestamp: new Date(now - 5000).toISOString(),
                                level: 'INFO',
                                source: 'api',
                                message: 'API server started successfully on port 8000'
                            },
                            {
                                id: 2,
                                timestamp: new Date(now - 10000).toISOString(),
                                level: 'WARNING',
                                source: 'worker',
                                message: 'Worker queue getting full (85% capacity)'
                            },
                            {
                                id: 3,
                                timestamp: new Date(now - 15000).toISOString(),
                                level: 'ERROR',
                                source: 'database',
                                message: 'Connection timeout to database after 30 seconds'
                            },
                            {
                                id: 4,
                                timestamp: new Date(now - 20000).toISOString(),
                                level: 'DEBUG',
                                source: 'system',
                                message: 'Memory usage: 2.1GB / 16GB (13.1%)'
                            },
                            {
                                id: 5,
                                timestamp: new Date(now - 25000).toISOString(),
                                level: 'INFO',
                                source: 'api',
                                message: 'New generation request received from user 12345'
                            }
                        ]
                    };
                }
            };
        },

        async loadLogs() {
            try {
                const response = await this.api.getLogs();
                
                if (response.success) {
                    this.logs = response.logs || [];
                    this.filterLogs();
                    
                    if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        console.log(`📋 Loaded ${this.logs.length} log entries`);
                    }
                } else {
                    throw new Error(response.error || 'Failed to load logs');
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('❌ Failed to load logs:', error);
                this.showToast(`Failed to load logs: ${error.message}`, 'error');
            }
        },

        filterLogs() {
            let filtered = [...this.logs];
            
            // Filter by level
            if (this.logLevel !== 'all') {
                const levelPriority = {
                    'DEBUG': 0,
                    'INFO': 1,
                    'WARNING': 2,
                    'ERROR': 3
                };
                
                const selectedLevelPriority = levelPriority[this.logLevel];
                if (selectedLevelPriority !== undefined) {
                    filtered = filtered.filter(log => {
                        const logPriority = levelPriority[log.level];
                        return logPriority !== undefined && logPriority >= selectedLevelPriority;
                    });
                }
            }
            
            // Filter by source
            if (this.logSource !== 'all') {
                filtered = filtered.filter(log => log.source === this.logSource);
            }
            
            // Sort by timestamp (newest first)
            filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            this.filteredLogs = filtered;
            
            if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log(`📋 Filtered to ${filtered.length} log entries (level: ${this.logLevel}, source: ${this.logSource})`);
            }
        },

        toggleAutoRefresh() {
            if (this.autoRefreshLogs) {
                this.startAutoRefresh();
                this.showToast('Log auto-refresh enabled', 'info');
            } else {
                this.stopAutoRefresh();
                this.showToast('Log auto-refresh disabled', 'info');
            }
        },

        startAutoRefresh() {
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
            }
            
            // Refresh logs every 5 seconds
            this.autoRefreshInterval = setInterval(() => {
                this.loadLogs();
            }, 5000);
            
            if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('📋 Auto-refresh started (5 second interval)');
            }
        },

        stopAutoRefresh() {
            if (this.autoRefreshInterval) {
                clearInterval(this.autoRefreshInterval);
                this.autoRefreshInterval = null;
                
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.log('📋 Auto-refresh stopped');
                }
            }
        },

        async clearLogs() {
            try {
                if (this.api.clearLogs) {
                    const response = await this.api.clearLogs();
                    if (response.success) {
                        this.logs = [];
                        this.filteredLogs = [];
                        this.showToast('Logs cleared successfully', 'success');
                    } else {
                        throw new Error(response.error || 'Failed to clear logs');
                    }
                } else {
                    // Fallback: just clear the UI
                    this.logs = [];
                    this.filteredLogs = [];
                    this.showToast('Logs cleared from view', 'info');
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('❌ Failed to clear logs:', error);
                this.showToast(`Failed to clear logs: ${error.message}`, 'error');
            }
        },

        async downloadLogs() {
            try {
                if (this.api.downloadLogs) {
                    await this.api.downloadLogs();
                    this.showToast('Log download started', 'success');
                } else {
                    // Fallback: create a downloadable file
                    const logData = this.logs.map(log => 
                        `${log.timestamp} [${log.level}] ${log.source}: ${log.message}`
                    ).join('\n');
                    
                    const blob = new Blob([logData], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `system-logs-${new Date().toISOString().split('T')[0]}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    this.showToast('Logs downloaded', 'success');
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('❌ Failed to download logs:', error);
                this.showToast(`Failed to download logs: ${error.message}`, 'error');
            }
        },

        formatLogTime(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleTimeString();
        },

        formatLogDate(timestamp) {
            const date = new Date(timestamp);
            return date.toLocaleDateString();
        },

        getLogLevelClass(level) {
            const classes = {
                'ERROR': 'text-red-400',
                'WARNING': 'text-yellow-400',
                'INFO': 'text-blue-400',
                'DEBUG': 'text-gray-400'
            };
            return classes[level] || 'text-gray-400';
        },

        showToast(message, type = 'info') {
            // Dispatch a custom event that the parent systemAdmin can listen to
            this.$dispatch('toast', { 
                message: message, 
                type: type 
            });
        },

        // Cleanup when component is destroyed
        destroy() {
            this.stopAutoRefresh();
            
            if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('📋 Log Viewer cleanup completed');
            }
        }
    };
}
