/**
 * Performance Analytics - Real-time Operations Module
 * 
 * Handles auto-refresh, WebSocket connections, and real-time updates.
 */

/**
 * Real-time operations for performance analytics
 */
const performanceRealtime = {
    /**
     * WebSocket connection for real-time updates
     */
    websocket: null,
    
    /**
     * Auto-refresh interval ID
     */
    refreshInterval: null,
    
    /**
     * Default refresh interval in milliseconds
     */
    defaultRefreshInterval: 30000, // 30 seconds
    
    /**
     * Starts auto-refresh with specified interval
     */
    startAutoRefresh(refreshCallback, interval = null) {
        this.stopAutoRefresh(); // Clear any existing interval
        
        const refreshInterval = interval || this.defaultRefreshInterval;
        
        this.refreshInterval = setInterval(() => {
            if (typeof refreshCallback === 'function') {
                refreshCallback();
            }
        }, refreshInterval);
        
        return this.refreshInterval;
    },
    
    /**
     * Stops auto-refresh
     */
    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    },
    
    /**
     * Establishes WebSocket connection for real-time updates
     */
    connectWebSocket(updateCallback, errorCallback = null) {
        try {
            // Close existing connection if any
            this.disconnectWebSocket();
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/analytics`;
            
            this.websocket = new WebSocket(wsUrl);
            
            this.websocket.onopen = () => {
                // WebSocket connection opened
                this.sendMessage({ type: 'subscribe', channel: 'analytics' });
            };
            
            this.websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data, updateCallback);
                } catch (parseError) {
                    if (errorCallback) {
                        errorCallback('Failed to parse WebSocket message', parseError);
                    }
                }
            };
            
            this.websocket.onerror = (error) => {
                if (errorCallback) {
                    errorCallback('WebSocket error', error);
                }
            };
            
            this.websocket.onclose = () => {
                // Attempt to reconnect after a delay
                setTimeout(() => {
                    if (updateCallback) {
                        this.connectWebSocket(updateCallback, errorCallback);
                    }
                }, 5000);
            };
            
            return this.websocket;
            
        } catch (error) {
            if (errorCallback) {
                errorCallback('Failed to establish WebSocket connection', error);
            }
            return null;
        }
    },
    
    /**
     * Handles incoming WebSocket messages
     */
    handleWebSocketMessage(data, updateCallback) {
        if (!data || !data.type) return;
        
        switch (data.type) {
            case 'kpi_update':
                if (updateCallback && data.kpis) {
                    updateCallback('kpis', data.kpis);
                }
                break;
                
            case 'new_generation':
                if (updateCallback && data.generation) {
                    updateCallback('generation', data.generation);
                }
                break;
                
            case 'system_metrics':
                if (updateCallback && data.metrics) {
                    updateCallback('system_metrics', data.metrics);
                }
                break;
                
            case 'error_occurred':
                if (updateCallback && data.error) {
                    updateCallback('error', data.error);
                }
                break;
                
            case 'lora_usage_update':
                if (updateCallback && data.usage) {
                    updateCallback('lora_usage', data.usage);
                }
                break;
                
            default:
                // Unknown message type - pass through to callback
                if (updateCallback) {
                    updateCallback('unknown', data);
                }
        }
    },
    
    /**
     * Sends message through WebSocket
     */
    sendMessage(message) {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
            this.websocket.send(JSON.stringify(message));
            return true;
        }
        return false;
    },
    
    /**
     * Disconnects WebSocket
     */
    disconnectWebSocket() {
        if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
        }
    },
    
    /**
     * Checks WebSocket connection status
     */
    isWebSocketConnected() {
        return this.websocket && this.websocket.readyState === WebSocket.OPEN;
    },
    
    /**
     * Manages live data updates for charts
     */
    updateLiveChartData(charts, newDataPoint, chartType) {
        const chart = charts[chartType];
        if (!chart || !newDataPoint) return;
        
        const maxDataPoints = 50; // Limit data points for performance
        
        // Add new data point
        if (chart.data.labels) {
            chart.data.labels.push(this.formatTimestamp(newDataPoint.timestamp));
            
            // Remove old data points if exceeding limit
            if (chart.data.labels.length > maxDataPoints) {
                chart.data.labels.shift();
            }
        }
        
        // Update datasets
        chart.data.datasets.forEach((dataset, index) => {
            const dataKey = this.getDataKeyForDataset(chartType, index);
            if (dataKey && newDataPoint[dataKey] !== undefined) {
                dataset.data.push(newDataPoint[dataKey]);
                
                // Remove old data points
                if (dataset.data.length > maxDataPoints) {
                    dataset.data.shift();
                }
            }
        });
        
        // Update chart with animation disabled for performance
        chart.update('none');
    },
    
    /**
     * Gets data key for chart dataset
     */
    getDataKeyForDataset(chartType, datasetIndex) {
        const dataKeyMappings = {
            volume: ['count'],
            performance: ['avg_time', 'success_rate'],
            systemMetrics: ['cpu', 'memory', 'gpu']
        };
        
        const keys = dataKeyMappings[chartType];
        return keys && keys[datasetIndex] ? keys[datasetIndex] : null;
    },
    
    /**
     * Formats timestamp for chart labels
     */
    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    },
    
    /**
     * Sets up real-time monitoring
     */
    setupRealTimeMonitoring(options = {}) {
        const {
            enableAutoRefresh = true,
            enableWebSocket = true,
            refreshInterval = null,
            updateCallback = null,
            errorCallback = null
        } = options;
        
        const monitoringStatus = {
            autoRefresh: false,
            webSocket: false
        };
        
        // Setup auto-refresh
        if (enableAutoRefresh && updateCallback) {
            this.startAutoRefresh(updateCallback, refreshInterval);
            monitoringStatus.autoRefresh = true;
        }
        
        // Setup WebSocket
        if (enableWebSocket && updateCallback) {
            this.connectWebSocket(updateCallback, errorCallback);
            monitoringStatus.webSocket = true;
        }
        
        return monitoringStatus;
    },
    
    /**
     * Tears down real-time monitoring
     */
    tearDownRealTimeMonitoring() {
        this.stopAutoRefresh();
        this.disconnectWebSocket();
    },
    
    /**
     * Gets real-time monitoring status
     */
    getMonitoringStatus() {
        return {
            autoRefresh: this.refreshInterval !== null,
            webSocket: this.isWebSocketConnected(),
            refreshInterval: this.refreshInterval,
            websocketState: this.websocket ? this.websocket.readyState : null
        };
    },
    
    /**
     * Handles visibility change (tab switching)
     */
    handleVisibilityChange(isVisible, pauseCallback, resumeCallback) {
        if (isVisible) {
            // Resume monitoring when tab becomes visible
            if (resumeCallback) resumeCallback();
        } else {
            // Pause monitoring when tab is hidden to save resources
            if (pauseCallback) pauseCallback();
        }
    },
    
    /**
     * Sets up visibility change handling
     */
    setupVisibilityHandling(pauseCallback, resumeCallback) {
        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange(
                !document.hidden,
                pauseCallback,
                resumeCallback
            );
        });
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { performanceRealtime };
} else if (typeof window !== 'undefined') {
    window.performanceRealtime = performanceRealtime;
}
