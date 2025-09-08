/**
 * Performance Analytics - State Management Module
 * 
 * Handles all state-related functionality for performance analytics
 * including KPIs, chart data, and UI state management.
 */

/**
 * Creates the initial state for performance analytics component
 */
function createPerformanceAnalyticsState() {
    return {
        // UI State
        isLoading: false,
        timeRange: '24h',
        autoRefresh: false,
        refreshInterval: null,
        showToast: false,
        toastMessage: '',
        toastType: 'success',
        
        // Charts container
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
        
        // Analytics Data
        topLoras: [],
        errorAnalysis: [],
        performanceInsights: [],
        
        // Chart Data
        chartData: {
            generationVolume: [],
            performance: [],
            loraUsage: [],
            resourceUsage: []
        }
    };
}

/**
 * State mutation methods for performance analytics
 */
const performanceAnalyticsState = {
    /**
     * Updates KPIs data
     */
    updateKPIs(state, kpis) {
        Object.assign(state.kpis, kpis);
        return state;
    },
    
    /**
     * Sets loading state
     */
    setLoading(state, isLoading) {
        state.isLoading = isLoading;
        return state;
    },
    
    /**
     * Updates time range and related state
     */
    setTimeRange(state, timeRange) {
        state.timeRange = timeRange;
        return state;
    },
    
    /**
     * Sets auto refresh state
     */
    setAutoRefresh(state, enabled, interval = null) {
        state.autoRefresh = enabled;
        if (interval !== null) {
            state.refreshInterval = interval;
        }
        return state;
    },
    
    /**
     * Updates top LoRAs data
     */
    setTopLoras(state, topLoras) {
        state.topLoras = [...topLoras];
        return state;
    },
    
    /**
     * Updates error analysis data
     */
    setErrorAnalysis(state, errorAnalysis) {
        state.errorAnalysis = [...errorAnalysis];
        return state;
    },
    
    /**
     * Updates performance insights
     */
    setPerformanceInsights(state, insights) {
        state.performanceInsights = [...insights];
        return state;
    },
    
    /**
     * Updates chart data
     */
    setChartData(state, chartData) {
        Object.assign(state.chartData, chartData);
        return state;
    },
    
    /**
     * Updates specific chart data by type
     */
    updateChartDataType(state, type, data) {
        if (state.chartData[type] !== undefined) {
            state.chartData[type] = [...data];
        }
        return state;
    },
    
    /**
     * Stores chart instance reference
     */
    setChart(state, name, chartInstance) {
        state.charts[name] = chartInstance;
        return state;
    },
    
    /**
     * Removes chart instance reference
     */
    removeChart(state, name) {
        if (state.charts[name]) {
            delete state.charts[name];
        }
        return state;
    },
    
    /**
     * Shows toast notification
     */
    showToast(state, { message, type = 'success' }) {
        state.toastMessage = message;
        state.toastType = type;
        state.showToast = true;
        return state;
    },
    
    /**
     * Hides toast notification
     */
    hideToast(state) {
        state.showToast = false;
        return state;
    },
    
    /**
     * Clears all data for refresh
     */
    clearData(state) {
        // Reset KPIs
        Object.keys(state.kpis).forEach(key => {
            state.kpis[key] = 0;
        });
        
        // Clear arrays
        state.topLoras = [];
        state.errorAnalysis = [];
        state.performanceInsights = [];
        
        // Clear chart data
        Object.keys(state.chartData).forEach(key => {
            state.chartData[key] = [];
        });
        
        return state;
    },
    
    /**
     * Updates multiple state properties at once
     */
    updateMultiple(state, updates) {
        Object.keys(updates).forEach(key => {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                if (typeof state[key] === 'object' && !Array.isArray(state[key])) {
                    Object.assign(state[key], updates[key]);
                } else {
                    state[key] = updates[key];
                }
            }
        });
        return state;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createPerformanceAnalyticsState, performanceAnalyticsState };
} else if (typeof window !== 'undefined') {
    window.createPerformanceAnalyticsState = createPerformanceAnalyticsState;
    window.performanceAnalyticsState = performanceAnalyticsState;
}
