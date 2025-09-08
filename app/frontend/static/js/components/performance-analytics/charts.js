/**
 * Performance Analytics - Chart Management Module
 * 
 * Handles chart creation, updating, and rendering using Chart.js.
 */

/**
 * Chart management operations for performance analytics
 */
const performanceCharts = {
    /**
     * Initializes all charts for the analytics dashboard
     */
    initializeCharts(chartData = {}) {
        const charts = {};
        
        try {
            charts.volume = this.createVolumeChart();
            charts.performance = this.createPerformanceChart();
            charts.loraUsage = this.createLoraUsageChart();
            charts.systemMetrics = this.createSystemMetricsChart();
            
            // Update charts with initial data if provided
            if (Object.keys(chartData).length > 0) {
                this.updateAllCharts(charts, chartData);
            }
            
            return charts;
            
        } catch (error) {
            // Fallback if Chart.js is not available
            return {};
        }
    },
    
    /**
     * Creates generation volume chart
     */
    createVolumeChart() {
        const ctx = document.getElementById('volumeChart');
        if (!ctx || typeof Chart === 'undefined') return null;
        
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Generations',
                    data: [],
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    },
    
    /**
     * Creates performance metrics chart
     */
    createPerformanceChart() {
        const ctx = document.getElementById('performanceChart');
        if (!ctx || typeof Chart === 'undefined') return null;
        
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Avg Time (s)',
                        data: [],
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.1,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Success Rate (%)',
                        data: [],
                        borderColor: 'rgb(16, 185, 129)',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.1,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        beginAtZero: true
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        beginAtZero: true,
                        max: 100,
                        grid: {
                            drawOnChartArea: false,
                        },
                    }
                }
            }
        });
    },
    
    /**
     * Creates LoRA usage chart
     */
    createLoraUsageChart() {
        const ctx = document.getElementById('loraUsageChart');
        if (!ctx || typeof Chart === 'undefined') return null;
        
        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        'rgb(59, 130, 246)',
                        'rgb(16, 185, 129)',
                        'rgb(239, 68, 68)',
                        'rgb(245, 158, 11)',
                        'rgb(139, 92, 246)',
                        'rgb(236, 72, 153)',
                        'rgb(14, 165, 233)',
                        'rgb(34, 197, 94)',
                        'rgb(251, 113, 133)',
                        'rgb(168, 85, 247)'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    },
    
    /**
     * Creates system metrics chart
     */
    createSystemMetricsChart() {
        const ctx = document.getElementById('systemMetricsChart');
        if (!ctx || typeof Chart === 'undefined') return null;
        
        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'CPU %',
                        data: [],
                        borderColor: 'rgb(59, 130, 246)',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.1
                    },
                    {
                        label: 'Memory %',
                        data: [],
                        borderColor: 'rgb(16, 185, 129)',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.1
                    },
                    {
                        label: 'GPU %',
                        data: [],
                        borderColor: 'rgb(239, 68, 68)',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    },
    
    /**
     * Updates all charts with new data
     */
    updateAllCharts(charts, chartData) {
        if (charts.volume && chartData.generationVolume) {
            this.updateVolumeChart(charts.volume, chartData.generationVolume);
        }
        
        if (charts.performance && chartData.performance) {
            this.updatePerformanceChart(charts.performance, chartData.performance);
        }
        
        if (charts.loraUsage && chartData.loraUsage) {
            this.updateLoraUsageChart(charts.loraUsage, chartData.loraUsage);
        }
        
        if (charts.systemMetrics && chartData.resourceUsage) {
            this.updateSystemMetricsChart(charts.systemMetrics, chartData.resourceUsage);
        }
    },
    
    /**
     * Updates volume chart with new data
     */
    updateVolumeChart(chart, data) {
        if (!chart || !data) return;
        
        const labels = data.map(item => 
            new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        const values = data.map(item => item.count);
        
        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.update('none'); // Animation disabled for performance
    },
    
    /**
     * Updates performance chart with new data
     */
    updatePerformanceChart(chart, data) {
        if (!chart || !data) return;
        
        const labels = data.map(item => 
            new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        const avgTimes = data.map(item => item.avg_time);
        const successRates = data.map(item => item.success_rate);
        
        chart.data.labels = labels;
        chart.data.datasets[0].data = avgTimes;
        chart.data.datasets[1].data = successRates;
        chart.update('none');
    },
    
    /**
     * Updates LoRA usage chart with new data
     */
    updateLoraUsageChart(chart, data) {
        if (!chart || !data) return;
        
        const labels = data.map(item => item.name);
        const values = data.map(item => item.usage);
        
        chart.data.labels = labels;
        chart.data.datasets[0].data = values;
        chart.update('none');
    },
    
    /**
     * Updates system metrics chart with new data
     */
    updateSystemMetricsChart(chart, data) {
        if (!chart || !data) return;
        
        const labels = data.map(item => 
            new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        );
        const cpuData = data.map(item => item.cpu);
        const memoryData = data.map(item => item.memory);
        const gpuData = data.map(item => item.gpu);
        
        chart.data.labels = labels;
        chart.data.datasets[0].data = cpuData;
        chart.data.datasets[1].data = memoryData;
        chart.data.datasets[2].data = gpuData;
        chart.update('none');
    },
    
    /**
     * Destroys all charts to free memory
     */
    destroyCharts(charts) {
        Object.values(charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
    },
    
    /**
     * Resizes charts when container changes
     */
    resizeCharts(charts) {
        Object.values(charts).forEach(chart => {
            if (chart && typeof chart.resize === 'function') {
                chart.resize();
            }
        });
    },
    
    /**
     * Checks if Chart.js is available
     */
    isChartJsAvailable() {
        return typeof Chart !== 'undefined';
    },
    
    /**
     * Gets chart configuration for export
     */
    getChartConfig(chartType) {
        const configs = {
            volume: {
                type: 'line',
                title: 'Generation Volume Over Time',
                yAxisLabel: 'Number of Generations'
            },
            performance: {
                type: 'line',
                title: 'Performance Metrics',
                yAxisLabel: 'Time (seconds) / Success Rate (%)'
            },
            loraUsage: {
                type: 'doughnut',
                title: 'LoRA Usage Distribution',
                yAxisLabel: 'Usage Count'
            },
            systemMetrics: {
                type: 'line',
                title: 'System Resource Usage',
                yAxisLabel: 'Usage Percentage (%)'
            }
        };
        
        return configs[chartType] || null;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { performanceCharts };
} else if (typeof window !== 'undefined') {
    window.performanceCharts = performanceCharts;
}
