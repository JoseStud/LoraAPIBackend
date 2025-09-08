/**
 * Performance Analytics - Metrics Operations Module
 * 
 * Handles data loading, KPI calculations, and analytics data processing.
 */

/**
 * Metrics operations for performance analytics
 */
const performanceMetrics = {
    /**
     * Loads key performance indicators
     */
    async loadKPIs(timeRange) {
        try {
            const response = await fetch(`/api/v1/analytics/kpis?timeRange=${timeRange}`);
            if (!response.ok) throw new Error('Failed to load KPIs');
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('Error loading KPIs:', error);
            // Return mock data for development
            return this.generateMockKPIs();
        }
    },
    
    /**
     * Generates mock KPI data for development
     */
    generateMockKPIs() {
        return {
            total_generations: 15847,
            generation_growth: 12.3,
            avg_generation_time: 42.7,
            time_improvement: -8.5,
            success_rate: 94.3,
            total_failed: 71,
            active_loras: 34,
            total_loras: 127
        };
    },
    
    /**
     * Loads top performing LoRAs
     */
    async loadTopLoras(timeRange) {
        try {
            const response = await fetch(`/api/v1/analytics/top-loras?timeRange=${timeRange}`);
            if (!response.ok) throw new Error('Failed to load top LoRAs');
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('Error loading top LoRAs:', error);
            return this.generateMockTopLoras();
        }
    },
    
    /**
     * Generates mock top LoRAs data
     */
    generateMockTopLoras() {
        return [
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
                usage_count: 234,
                success_rate: 91.5,
                avg_time: 47.8
            },
            {
                id: 5,
                name: "Oil Painting",
                version: "v2.0",
                usage_count: 198,
                success_rate: 89.3,
                avg_time: 55.1
            }
        ];
    },
    
    /**
     * Loads error analysis data
     */
    async loadErrorAnalysis(timeRange) {
        try {
            const response = await fetch(`/api/v1/analytics/errors?timeRange=${timeRange}`);
            if (!response.ok) throw new Error('Failed to load error analysis');
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('Error loading error analysis:', error);
            return this.generateMockErrorAnalysis();
        }
    },
    
    /**
     * Generates mock error analysis data
     */
    generateMockErrorAnalysis() {
        return [
            {
                error_type: "Out of Memory",
                count: 23,
                percentage: 32.4,
                trend: "decreasing"
            },
            {
                error_type: "Model Loading Failed",
                count: 18,
                percentage: 25.4,
                trend: "stable"
            },
            {
                error_type: "Invalid Parameters",
                count: 15,
                percentage: 21.1,
                trend: "increasing"
            },
            {
                error_type: "Timeout",
                count: 12,
                percentage: 16.9,
                trend: "decreasing"
            },
            {
                error_type: "Other",
                count: 3,
                percentage: 4.2,
                trend: "stable"
            }
        ];
    },
    
    /**
     * Loads performance insights
     */
    async loadPerformanceInsights(timeRange) {
        try {
            const response = await fetch(`/api/v1/analytics/insights?timeRange=${timeRange}`);
            if (!response.ok) throw new Error('Failed to load performance insights');
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('Error loading performance insights:', error);
            return this.generateMockInsights();
        }
    },
    
    /**
     * Generates mock performance insights
     */
    generateMockInsights() {
        return [
            {
                type: "optimization",
                title: "GPU Memory Optimization Opportunity",
                description: "Consider batch processing smaller images to improve GPU memory usage",
                impact: "high",
                recommendation: "enable_batch_processing"
            },
            {
                type: "scaling",
                title: "Peak Usage Hours Identified",
                description: "Usage peaks between 2-4 PM daily. Consider auto-scaling during these hours",
                impact: "medium",
                recommendation: "implement_auto_scaling"
            },
            {
                type: "maintenance",
                title: "Unused LoRAs Detected",
                description: "12 LoRAs haven't been used in the last 30 days",
                impact: "low",
                recommendation: "archive_unused_loras"
            }
        ];
    },
    
    /**
     * Loads chart data for all visualizations
     */
    async loadChartData(timeRange) {
        try {
            const response = await fetch(`/api/v1/analytics/charts?timeRange=${timeRange}`);
            if (!response.ok) throw new Error('Failed to load chart data');
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('Error loading chart data:', error);
            return this.generateMockChartData();
        }
    },
    
    /**
     * Generates mock chart data for development
     */
    generateMockChartData() {
        const hours = 24;
        const now = new Date();
        
        // Generation volume data
        const generationVolume = Array.from({ length: hours }, (_, i) => {
            const time = new Date(now.getTime() - (hours - i - 1) * 60 * 60 * 1000);
            return {
                timestamp: time.toISOString(),
                count: Math.floor(Math.random() * 50) + 10
            };
        });
        
        // Performance data
        const performance = Array.from({ length: hours }, (_, i) => {
            const time = new Date(now.getTime() - (hours - i - 1) * 60 * 60 * 1000);
            return {
                timestamp: time.toISOString(),
                avg_time: Math.random() * 30 + 30,
                success_rate: Math.random() * 10 + 90
            };
        });
        
        // LoRA usage data
        const loraUsage = Array.from({ length: 10 }, (_, i) => ({
            name: `LoRA ${i + 1}`,
            usage: Math.floor(Math.random() * 100) + 50
        }));
        
        // Resource usage data
        const resourceUsage = Array.from({ length: hours }, (_, i) => {
            const time = new Date(now.getTime() - (hours - i - 1) * 60 * 60 * 1000);
            return {
                timestamp: time.toISOString(),
                cpu: Math.random() * 40 + 30,
                memory: Math.random() * 30 + 50,
                gpu: Math.random() * 50 + 40
            };
        });
        
        return {
            generationVolume,
            performance,
            loraUsage,
            resourceUsage
        };
    },
    
    /**
     * Calculates derived metrics from raw data
     */
    calculateDerivedMetrics(chartData, kpis) {
        const derived = {};
        
        // Calculate average response time from chart data
        if (chartData.performance && chartData.performance.length > 0) {
            const avgResponseTime = chartData.performance.reduce((sum, item) => sum + item.avg_time, 0) / chartData.performance.length;
            derived.avgResponseTime = avgResponseTime;
        }
        
        // Calculate error rate
        if (kpis.total_generations && kpis.total_failed) {
            derived.errorRate = (kpis.total_failed / kpis.total_generations * 100).toFixed(2);
        }
        
        // Calculate uptime percentage
        if (chartData.performance && chartData.performance.length > 0) {
            const uptimeData = chartData.performance.filter(item => item.success_rate > 0);
            derived.uptimePercentage = ((uptimeData.length / chartData.performance.length) * 100).toFixed(2);
        }
        
        return derived;
    },
    
    /**
     * Loads all analytics data
     */
    async loadAllData(timeRange) {
        try {
            const [kpis, topLoras, errorAnalysis, insights, chartData] = await Promise.all([
                this.loadKPIs(timeRange),
                this.loadTopLoras(timeRange),
                this.loadErrorAnalysis(timeRange),
                this.loadPerformanceInsights(timeRange),
                this.loadChartData(timeRange)
            ]);
            
            const derivedMetrics = this.calculateDerivedMetrics(chartData, kpis);
            
            return {
                kpis,
                topLoras,
                errorAnalysis,
                insights,
                chartData,
                derivedMetrics
            };
            
        } catch (error) {
            console.error('Error loading analytics data:', error);
            throw error;
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { performanceMetrics };
} else if (typeof window !== 'undefined') {
    window.performanceMetrics = performanceMetrics;
}
