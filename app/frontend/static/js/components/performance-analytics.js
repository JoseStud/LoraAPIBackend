/**
 * Performance Analytics Alpine.js Component
 * Comprehensive analytics dashboard for system performance monitoring
 */

function performanceAnalytics() {
    return {
        // State
        isLoading: false,
        timeRange: '24h',
        autoRefresh: false,
        refreshInterval: null,
        showToast: false,
        toastMessage: '',
        toastType: 'success',
        
        // Charts
        charts: {},
        
        // Key Performance Indicators
        kpis: {
            total_generations: 0,
            generation_growth: 0,
            avg_generation_time: 0,
            time_improvement: 0,
            success_rate: 0,
            total_failed: 0,
            active_loras: 0,
            total_loras: 0
        },
    // Safe default referenced in templates
    success: true,
        
        // Top performing LoRAs
        topLoras: [],
        
        // Error analysis
        errorAnalysis: [],
        
        // Performance insights
        performanceInsights: [],
        
        // Chart data
        chartData: {
            generationVolume: [],
            performance: [],
            loraUsage: [],
            resourceUsage: []
        },
        
        /**
         * Initialize the component
         */
        async init() {
            await this.loadAnalytics();
            this.initializeCharts();
        },
        
        /**
         * Load all analytics data
         */
        async loadAnalytics() {
            this.isLoading = true;
            try {
                await Promise.all([
                    this.loadKPIs(),
                    this.loadTopLoras(),
                    this.loadErrorAnalysis(),
                    this.loadPerformanceInsights(),
                    this.loadChartData()
                ]);
                
                this.updateCharts();
                
            } catch (error) {
                console.error('Error loading analytics:', error);
                this.showToastMessage('Failed to load analytics data', 'error');
            } finally {
                this.isLoading = false;
            }
        },
        
        /**
         * Load Key Performance Indicators
         */
        async loadKPIs() {
            try {
                const response = await fetch(`/api/v1/analytics/kpis?timeRange=${this.timeRange}`);
                if (!response.ok) throw new Error('Failed to load KPIs');
                
                const data = await response.json();
                this.kpis = data;
                
            } catch (error) {
                console.error('Error loading KPIs:', error);
                // Mock data for development
                this.kpis = {
                    total_generations: 1247,
                    generation_growth: 12.5,
                    avg_generation_time: 45.3,
                    time_improvement: 8.2,
                    success_rate: 94.3,
                    total_failed: 71,
                    active_loras: 34,
                    total_loras: 127
                };
            }
        },
        
        /**
         * Load top performing LoRAs
         */
        async loadTopLoras() {
            try {
                const response = await fetch(`/api/v1/analytics/top-loras?timeRange=${this.timeRange}`);
                if (!response.ok) throw new Error('Failed to load top LoRAs');
                
                const data = await response.json();
                this.topLoras = data;
                
            } catch (error) {
                console.error('Error loading top LoRAs:', error);
                // Mock data for development
                this.topLoras = [
                    {
                        id: 1,
                        name: "Anime Style v2.1",
                        version: "v2.1",
                        usage_count: 342,
                        success_rate: 96.8,
                        avg_time: 42.3
                    },
                    {
                        id: 2,
                        name: "Realistic Portrait",
                        version: "v1.5",
                        usage_count: 289,
                        success_rate: 94.2,
                        avg_time: 38.7
                    },
                    {
                        id: 3,
                        name: "Fantasy Art",
                        version: "v3.0",
                        usage_count: 267,
                        success_rate: 92.1,
                        avg_time: 51.2
                    },
                    {
                        id: 4,
                        name: "Cyberpunk Style",
                        version: "v1.8",
                        usage_count: 198,
                        success_rate: 89.4,
                        avg_time: 47.9
                    },
                    {
                        id: 5,
                        name: "Nature Photography",
                        version: "v2.0",
                        usage_count: 156,
                        success_rate: 97.1,
                        avg_time: 35.8
                    }
                ];
            }
        },
        
        /**
         * Load error analysis data
         */
        async loadErrorAnalysis() {
            try {
                const response = await fetch(`/api/v1/analytics/errors?timeRange=${this.timeRange}`);
                if (!response.ok) throw new Error('Failed to load error analysis');
                
                const data = await response.json();
                this.errorAnalysis = data;
                
            } catch (error) {
                console.error('Error loading error analysis:', error);
                // Mock data for development
                this.errorAnalysis = [
                    {
                        type: "GPU Memory Exhausted",
                        count: 28,
                        percentage: 39.4,
                        description: "Generation failed due to insufficient GPU memory. Consider reducing batch size or image resolution."
                    },
                    {
                        type: "Network Timeout",
                        count: 15,
                        percentage: 21.1,
                        description: "Request timed out waiting for generation completion. Check network connectivity and worker status."
                    },
                    {
                        type: "Invalid LoRA Combination",
                        count: 12,
                        percentage: 16.9,
                        description: "Incompatible LoRA models used together. Review LoRA compatibility matrix."
                    },
                    {
                        type: "Prompt Validation Error",
                        count: 8,
                        percentage: 11.3,
                        description: "Prompt contains invalid or unsafe content. Review content filtering policies."
                    },
                    {
                        type: "Worker Crash",
                        count: 8,
                        percentage: 11.3,
                        description: "Generation worker crashed during processing. Check worker logs for details."
                    }
                ];
            }
        },
        
        /**
         * Load performance insights and recommendations
         */
        async loadPerformanceInsights() {
            try {
                const response = await fetch(`/api/v1/analytics/insights?timeRange=${this.timeRange}`);
                if (!response.ok) throw new Error('Failed to load performance insights');
                
                const data = await response.json();
                this.performanceInsights = data;
                
            } catch (error) {
                console.error('Error loading performance insights:', error);
                // Mock data for development
                this.performanceInsights = [
                    {
                        id: 1,
                        title: "High GPU Memory Usage",
                        description: "GPU memory utilization averaging 87%. Consider optimizing memory management or adding additional GPU capacity.",
                        severity: "medium",
                        recommendation: "enable_memory_optimization"
                    },
                    {
                        id: 2,
                        title: "Queue Backup During Peak Hours",
                        description: "Generation queue backing up 14:00-18:00 daily. Consider auto-scaling workers during peak periods.",
                        severity: "high",
                        recommendation: "configure_auto_scaling"
                    },
                    {
                        id: 3,
                        title: "Unused LoRAs Taking Space",
                        description: "42 LoRAs haven't been used in 30+ days. Archive unused models to free up storage space.",
                        severity: "low",
                        recommendation: "archive_unused_loras"
                    }
                ];
            }
        },
        
        /**
         * Load chart data for visualizations
         */
        async loadChartData() {
            try {
                const response = await fetch(`/api/v1/analytics/charts?timeRange=${this.timeRange}`);
                if (!response.ok) throw new Error('Failed to load chart data');
                
                const data = await response.json();
                this.chartData = data;
                
            } catch (error) {
                console.error('Error loading chart data:', error);
                // Generate mock data for development
                this.generateMockChartData();
            }
        },
        
        /**
         * Generate mock chart data for development
         */
        generateMockChartData() {
            const hours = 24;
            const now = new Date();
            
            // Generation volume data
            this.chartData.generationVolume = Array.from({ length: hours }, (_, i) => {
                const time = new Date(now.getTime() - (hours - i - 1) * 60 * 60 * 1000);
                return {
                    timestamp: time.toISOString(),
                    count: Math.floor(Math.random() * 50) + 10
                };
            });
            
            // Performance data
            this.chartData.performance = Array.from({ length: hours }, (_, i) => {
                const time = new Date(now.getTime() - (hours - i - 1) * 60 * 60 * 1000);
                return {
                    timestamp: time.toISOString(),
                    avg_time: Math.random() * 30 + 30,
                    success_rate: Math.random() * 10 + 90
                };
            });
            
            // LoRA usage data
            this.chartData.loraUsage = this.topLoras.slice(0, 10).map(lora => ({
                name: lora.name,
                usage_count: lora.usage_count
            }));
            
            // Resource usage data
            this.chartData.resourceUsage = Array.from({ length: hours }, (_, i) => {
                const time = new Date(now.getTime() - (hours - i - 1) * 60 * 60 * 1000);
                return {
                    timestamp: time.toISOString(),
                    cpu_percent: Math.random() * 40 + 30,
                    memory_percent: Math.random() * 30 + 50,
                    gpu_percent: Math.random() * 50 + 40
                };
            });
        },
        
        /**
         * Initialize Chart.js charts
         */
        initializeCharts() {
            // Generation Volume Chart
            const volumeCtx = document.getElementById('generation-volume-chart');
            if (volumeCtx) {
                this.charts.volume = new Chart(volumeCtx, {
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
                        plugins: {
                            legend: {
                                display: false
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });
            }
            
            // Performance Chart
            const perfCtx = document.getElementById('performance-chart');
            if (perfCtx) {
                this.charts.performance = new Chart(perfCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [
                            {
                                label: 'Avg Time (s)',
                                data: [],
                                borderColor: 'rgb(16, 185, 129)',
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                tension: 0.1,
                                yAxisID: 'y'
                            },
                            {
                                label: 'Success Rate (%)',
                                data: [],
                                borderColor: 'rgb(139, 92, 246)',
                                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                                tension: 0.1,
                                yAxisID: 'y1'
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left'
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                grid: {
                                    drawOnChartArea: false
                                }
                            }
                        }
                    }
                });
            }
            
            // LoRA Usage Chart
            const loraCtx = document.getElementById('lora-usage-chart');
            if (loraCtx) {
                this.charts.loraUsage = new Chart(loraCtx, {
                    type: 'doughnut',
                    data: {
                        labels: [],
                        datasets: [{
                            data: [],
                            backgroundColor: [
                                'rgb(59, 130, 246)',
                                'rgb(16, 185, 129)',
                                'rgb(139, 92, 246)',
                                'rgb(245, 158, 11)',
                                'rgb(239, 68, 68)',
                                'rgb(156, 163, 175)',
                                'rgb(34, 197, 94)',
                                'rgb(168, 85, 247)',
                                'rgb(251, 146, 60)',
                                'rgb(14, 165, 233)'
                            ]
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'right'
                            }
                        }
                    }
                });
            }
            
            // Resource Usage Chart
            const resourceCtx = document.getElementById('resource-usage-chart');
            if (resourceCtx) {
                this.charts.resourceUsage = new Chart(resourceCtx, {
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
            }
        },
        
        /**
         * Update all charts with current data
         */
        updateCharts() {
            // Update generation volume chart
            if (this.charts.volume && this.chartData.generationVolume) {
                const labels = this.chartData.generationVolume.map(item => 
                    new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                );
                const data = this.chartData.generationVolume.map(item => item.count);
                
                this.charts.volume.data.labels = labels;
                this.charts.volume.data.datasets[0].data = data;
                this.charts.volume.update();
            }
            
            // Update performance chart
            if (this.charts.performance && this.chartData.performance) {
                const labels = this.chartData.performance.map(item => 
                    new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                );
                const timeData = this.chartData.performance.map(item => item.avg_time);
                const successData = this.chartData.performance.map(item => item.success_rate);
                
                this.charts.performance.data.labels = labels;
                this.charts.performance.data.datasets[0].data = timeData;
                this.charts.performance.data.datasets[1].data = successData;
                this.charts.performance.update();
            }
            
            // Update LoRA usage chart
            if (this.charts.loraUsage && this.chartData.loraUsage) {
                const labels = this.chartData.loraUsage.map(item => item.name);
                const data = this.chartData.loraUsage.map(item => item.usage_count);
                
                this.charts.loraUsage.data.labels = labels;
                this.charts.loraUsage.data.datasets[0].data = data;
                this.charts.loraUsage.update();
            }
            
            // Update resource usage chart
            if (this.charts.resourceUsage && this.chartData.resourceUsage) {
                const labels = this.chartData.resourceUsage.map(item => 
                    new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                );
                const cpuData = this.chartData.resourceUsage.map(item => item.cpu_percent);
                const memoryData = this.chartData.resourceUsage.map(item => item.memory_percent);
                const gpuData = this.chartData.resourceUsage.map(item => item.gpu_percent);
                
                this.charts.resourceUsage.data.labels = labels;
                this.charts.resourceUsage.data.datasets[0].data = cpuData;
                this.charts.resourceUsage.data.datasets[1].data = memoryData;
                this.charts.resourceUsage.data.datasets[2].data = gpuData;
                this.charts.resourceUsage.update();
            }
        },
        
        /**
         * Toggle auto-refresh
         */
        toggleAutoRefresh() {
            if (this.autoRefresh) {
                this.refreshInterval = setInterval(() => {
                    this.loadAnalytics();
                }, 30000); // Refresh every 30 seconds
            } else {
                if (this.refreshInterval) {
                    clearInterval(this.refreshInterval);
                    this.refreshInterval = null;
                }
            }
        },
        
        /**
         * Apply performance recommendation
         */
        async applyRecommendation(insight) {
            try {
                const response = await fetch('/api/v1/analytics/apply-recommendation', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        recommendation: insight.recommendation,
                        insight_id: insight.id 
                    })
                });
                
                if (!response.ok) throw new Error('Failed to apply recommendation');
                
                this.showToastMessage('Recommendation applied successfully');
                await this.loadPerformanceInsights();
                
            } catch (error) {
                console.error('Error applying recommendation:', error);
                this.showToastMessage('Failed to apply recommendation', 'error');
            }
        },
        
        /**
         * Export analytics data
         */
        async exportData(format) {
            try {
                const response = await fetch(`/api/v1/analytics/export?format=${format}&timeRange=${this.timeRange}`);
                if (!response.ok) throw new Error('Failed to export data');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics-${this.timeRange}-${Date.now()}.${format}`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showToastMessage(`${format.toUpperCase()} export started`);
                
            } catch (error) {
                console.error('Error exporting data:', error);
                this.showToastMessage('Failed to export data', 'error');
            }
        },
        
        /**
         * Schedule analytics report
         */
        async scheduleReport() {
            // This would open a modal or redirect to a scheduling interface
            this.showToastMessage('Report scheduling feature coming soon', 'info');
        },
        
        /**
         * Format duration in seconds to readable format
         */
        formatDuration(seconds) {
            if (seconds < 60) {
                return `${seconds.toFixed(1)}s`;
            } else if (seconds < 3600) {
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = Math.floor(seconds % 60);
                return `${minutes}m ${remainingSeconds}s`;
            } else {
                const hours = Math.floor(seconds / 3600);
                const remainingMinutes = Math.floor((seconds % 3600) / 60);
                return `${hours}h ${remainingMinutes}m`;
            }
        },
        
        /**
         * Show toast notification
         */
        showToastMessage(message, type = 'success') {
            this.toastMessage = message;
            this.toastType = type;
            this.showToast = true;
            
            setTimeout(() => {
                this.showToast = false;
            }, 4000);
        },
        
        /**
         * Cleanup when component is destroyed
         */
        destroy() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
            
            // Destroy charts
            Object.values(this.charts).forEach(chart => {
                if (chart && typeof chart.destroy === 'function') {
                    chart.destroy();
                }
            });
        }
    };
}
