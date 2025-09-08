/**
 * Performance Analytics - Main Component Module
 * 
 * Main Alpine.js component that integrates all performance analytics modules
 * following the established modular architecture pattern.
 */

/**
 * Main Performance Analytics Alpine.js component factory
 */
function performanceAnalytics() {
    // Initialize state using state module
    const state = window.createPerformanceAnalyticsState ? window.createPerformanceAnalyticsState() : {};
    
    return {
        // Spread state properties
        ...state,
        
        // Component initialization
        init() {
            this.loadInitialData();
            this.setupCharts();
            this.setupRealTimeMonitoring();
            this.setupVisibilityHandling();
            
            // Set up watchers
            this.$watch('timeRange', (newRange) => {
                this.handleTimeRangeChange(newRange);
            });
            
            this.$watch('autoRefresh', (enabled) => {
                this.handleAutoRefreshToggle(enabled);
            });
        },
        
        // Data Loading Methods
        async loadInitialData() {
            if (!window.performanceMetrics) {
                this.showToastMessage('Performance metrics module not available', 'error');
                return;
            }
            
            this.isLoading = true;
            
            try {
                const data = await window.performanceMetrics.loadAllData(this.timeRange);
                
                // Update state with loaded data
                if (window.performanceAnalyticsState) {
                    window.performanceAnalyticsState.updateKPIs(this, data.kpis);
                    window.performanceAnalyticsState.setTopLoras(this, data.topLoras);
                    window.performanceAnalyticsState.setErrorAnalysis(this, data.errorAnalysis);
                    window.performanceAnalyticsState.setPerformanceInsights(this, data.insights);
                    window.performanceAnalyticsState.setChartData(this, data.chartData);
                }
                
                // Update charts with new data
                this.updateChartsWithData(data.chartData);
                
            } catch (error) {
                this.showToastMessage('Failed to load analytics data', 'error');
            } finally {
                this.isLoading = false;
            }
        },
        
        async refreshData() {
            await this.loadInitialData();
            this.showToastMessage('Data refreshed successfully');
        },
        
        // Chart Management
        setupCharts() {
            if (!window.performanceCharts) {
                return;
            }
            
            // Initialize charts
            this.charts = window.performanceCharts.initializeCharts(this.chartData);
            
            // Handle Chart.js not available
            if (!window.performanceCharts.isChartJsAvailable()) {
                this.showToastMessage('Charts are not available (Chart.js required)', 'warning');
            }
        },
        
        updateChartsWithData(chartData) {
            if (window.performanceCharts && this.charts) {
                window.performanceCharts.updateAllCharts(this.charts, chartData);
            }
        },
        
        // Real-time Monitoring
        setupRealTimeMonitoring() {
            if (!window.performanceRealtime) return;
            
            if (this.autoRefresh) {
                window.performanceRealtime.setupRealTimeMonitoring({
                    enableAutoRefresh: true,
                    enableWebSocket: true,
                    refreshInterval: 30000, // 30 seconds
                    updateCallback: (type, data) => this.handleRealTimeUpdate(type, data),
                    errorCallback: (message, error) => this.handleRealTimeError(message, error)
                });
            }
        },
        
        handleRealTimeUpdate(type, data) {
            switch (type) {
                case 'kpis':
                    if (window.performanceAnalyticsState) {
                        window.performanceAnalyticsState.updateKPIs(this, data);
                    }
                    break;
                case 'generation':
                    // Update generation volume chart
                    if (window.performanceRealtime && this.charts.volume) {
                        window.performanceRealtime.updateLiveChartData(
                            this.charts, 
                            data, 
                            'volume'
                        );
                    }
                    break;
                case 'system_metrics':
                    // Update system metrics chart
                    if (window.performanceRealtime && this.charts.systemMetrics) {
                        window.performanceRealtime.updateLiveChartData(
                            this.charts, 
                            data, 
                            'systemMetrics'
                        );
                    }
                    break;
                default:
                    break;
            }
        },
        
        handleRealTimeError(message, _error) {
            this.showToastMessage(`Real-time update error: ${message}`, 'error');
        },
        
        // Event Handlers
        handleTimeRangeChange(newRange) {
            if (window.performanceFilters && !window.performanceFilters.validateTimeRange(newRange)) {
                this.showToastMessage('Invalid time range selected', 'error');
                return;
            }
            
            this.loadInitialData();
        },
        
        handleAutoRefreshToggle(enabled) {
            if (window.performanceRealtime) {
                if (enabled) {
                    this.setupRealTimeMonitoring();
                } else {
                    window.performanceRealtime.tearDownRealTimeMonitoring();
                }
            }
        },
        
        // Export Functionality
        async exportData(format) {
            if (!window.performanceExports) {
                this.showToastMessage('Export functionality not available', 'error');
                return;
            }
            
            try {
                const exportData = {
                    kpis: this.kpis,
                    topLoras: this.topLoras,
                    errorAnalysis: this.errorAnalysis,
                    performanceInsights: this.performanceInsights,
                    chartData: this.chartData
                };
                
                // Add chart data from chart instances
                if (window.performanceExports && this.charts) {
                    exportData.charts = window.performanceExports.prepareChartDataForExport(this.charts);
                }
                
                await window.performanceExports.exportData(format, this.timeRange, exportData);
                this.showToastMessage(`${format.toUpperCase()} export completed successfully`);
                
            } catch (error) {
                this.showToastMessage(`Export failed: ${error.message}`, 'error');
            }
        },
        
        // Utility Methods
        formatDuration(seconds) {
            return window.performanceFilters ? 
                window.performanceFilters.formatDuration(seconds) : 
                `${seconds}s`;
        },
        
        formatPercentage(value, decimals = 1) {
            return window.performanceFilters ? 
                window.performanceFilters.formatPercentage(value, decimals) : 
                `${value}%`;
        },
        
        formatNumber(num) {
            return window.performanceFilters ? 
                window.performanceFilters.formatNumber(num) : 
                num.toString();
        },
        
        formatTimestamp(timestamp, format = 'datetime') {
            return window.performanceFilters ? 
                window.performanceFilters.formatTimestamp(timestamp, format) : 
                new Date(timestamp).toLocaleString();
        },
        
        getTrendClasses(trend) {
            return window.performanceFilters ? 
                window.performanceFilters.getTrendClasses(trend) : 
                'text-gray-600 bg-gray-100';
        },
        
        getTrendIcon(trend) {
            return window.performanceFilters ? 
                window.performanceFilters.getTrendIcon(trend) : 
                '➡️';
        },
        
        // UI Methods
        showToastMessage(message, type = 'success') {
            if (window.performanceAnalyticsState) {
                window.performanceAnalyticsState.showToast(this, { message, type });
                
                // Auto-hide toast after 4 seconds
                setTimeout(() => {
                    window.performanceAnalyticsState.hideToast(this);
                }, 4000);
            } else {
                // Fallback implementation
                this.toastMessage = message;
                this.toastType = type;
                this.showToast = true;
                
                setTimeout(() => {
                    this.showToast = false;
                }, 4000);
            }
        },
        
        getTimeRangeOptions() {
            return window.performanceFilters ? 
                window.performanceFilters.getTimeRangeOptions() : 
                [{ id: '24h', name: 'Last 24 Hours' }];
        },
        
        // Visibility Handling
        setupVisibilityHandling() {
            if (window.performanceRealtime) {
                window.performanceRealtime.setupVisibilityHandling(
                    () => this.pauseMonitoring(),
                    () => this.resumeMonitoring()
                );
            }
        },
        
        pauseMonitoring() {
            if (window.performanceRealtime) {
                window.performanceRealtime.stopAutoRefresh();
            }
        },
        
        resumeMonitoring() {
            if (this.autoRefresh && window.performanceRealtime) {
                window.performanceRealtime.startAutoRefresh(() => this.refreshData());
            }
        },
        
        // Cleanup
        destroy() {
            // Stop real-time monitoring
            if (window.performanceRealtime) {
                window.performanceRealtime.tearDownRealTimeMonitoring();
            }
            
            // Destroy charts
            if (window.performanceCharts && this.charts) {
                window.performanceCharts.destroyCharts(this.charts);
            }
        }
    };
}

// Register with Alpine.js or make globally available
if (typeof Alpine !== 'undefined') {
    Alpine.data('performanceAnalytics', performanceAnalytics);
} else if (typeof window !== 'undefined') {
    window.performanceAnalytics = performanceAnalytics;
}

// Module export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { performanceAnalytics };
}
