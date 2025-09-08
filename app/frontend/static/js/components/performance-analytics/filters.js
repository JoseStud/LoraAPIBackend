/**
 * Performance Analytics - Filters & Utilities Module
 * 
 * Handles filtering, time range management, formatting utilities,
 * and data processing functions.
 */

/**
 * Filters and utilities for performance analytics
 */
const performanceFilters = {
    /**
     * Available time range options
     */
    getTimeRangeOptions() {
        return [
            { id: '1h', name: 'Last Hour', hours: 1 },
            { id: '6h', name: 'Last 6 Hours', hours: 6 },
            { id: '24h', name: 'Last 24 Hours', hours: 24 },
            { id: '7d', name: 'Last 7 Days', hours: 168 },
            { id: '30d', name: 'Last 30 Days', hours: 720 },
            { id: '90d', name: 'Last 90 Days', hours: 2160 }
        ];
    },
    
    /**
     * Converts time range ID to API parameters
     */
    getTimeRangeParams(timeRangeId) {
        const option = this.getTimeRangeOptions().find(opt => opt.id === timeRangeId);
        if (!option) return null;
        
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - (option.hours * 60 * 60 * 1000));
        
        return {
            start: startTime.toISOString(),
            end: endTime.toISOString(),
            hours: option.hours
        };
    },
    
    /**
     * Formats duration in seconds to readable format
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
     * Formats percentage values
     */
    formatPercentage(value, decimals = 1) {
        if (typeof value !== 'number') return '0%';
        return `${value.toFixed(decimals)}%`;
    },
    
    /**
     * Formats large numbers with appropriate units
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return `${(num / 1000000).toFixed(1)}M`;
        } else if (num >= 1000) {
            return `${(num / 1000).toFixed(1)}K`;
        }
        return num.toString();
    },
    
    /**
     * Formats timestamps for display
     */
    formatTimestamp(timestamp, format = 'datetime') {
        const date = new Date(timestamp);
        
        switch (format) {
            case 'time':
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            case 'date':
                return date.toLocaleDateString();
            case 'datetime':
                return date.toLocaleString();
            case 'relative':
                return this.formatRelativeTime(date);
            default:
                return date.toLocaleString();
        }
    },
    
    /**
     * Formats relative time (e.g., "2 hours ago")
     */
    formatRelativeTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
        if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
        if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
        
        return date.toLocaleDateString();
    },
    
    /**
     * Filters metrics by selected types
     */
    filterMetricsByType(metrics, selectedTypes) {
        if (!selectedTypes || selectedTypes.length === 0) {
            return metrics;
        }
        
        return metrics.filter(metric => selectedTypes.includes(metric.type));
    },
    
    /**
     * Aggregates data by time intervals
     */
    aggregateDataByInterval(data, intervalMinutes = 60) {
        if (!data || !Array.isArray(data)) return [];
        
        const intervalMs = intervalMinutes * 60 * 1000;
        const aggregated = new Map();
        
        data.forEach(item => {
            const timestamp = new Date(item.timestamp);
            const intervalStart = new Date(Math.floor(timestamp.getTime() / intervalMs) * intervalMs);
            const intervalKey = intervalStart.toISOString();
            
            if (!aggregated.has(intervalKey)) {
                aggregated.set(intervalKey, {
                    timestamp: intervalKey,
                    count: 0,
                    sum: 0,
                    values: []
                });
            }
            
            const bucket = aggregated.get(intervalKey);
            bucket.count++;
            bucket.values.push(item);
            
            // Aggregate numeric values
            Object.keys(item).forEach(key => {
                if (typeof item[key] === 'number' && key !== 'timestamp') {
                    if (!bucket[key]) {
                        bucket[key] = 0;
                        bucket[`${key}_sum`] = 0;
                    }
                    bucket[`${key}_sum`] += item[key];
                    bucket[key] = bucket[`${key}_sum`] / bucket.count; // Average
                }
            });
        });
        
        return Array.from(aggregated.values()).sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
        );
    },
    
    /**
     * Calculates growth rate between two values
     */
    calculateGrowthRate(current, previous) {
        if (!previous || previous === 0) return 0;
        return ((current - previous) / previous) * 100;
    },
    
    /**
     * Calculates trend direction
     */
    calculateTrend(data, valueKey = 'value') {
        if (!data || data.length < 2) return 'stable';
        
        const values = data.map(item => item[valueKey]).filter(val => typeof val === 'number');
        if (values.length < 2) return 'stable';
        
        const first = values[0];
        const last = values[values.length - 1];
        const change = ((last - first) / first) * 100;
        
        if (change > 5) return 'increasing';
        if (change < -5) return 'decreasing';
        return 'stable';
    },
    
    /**
     * Gets CSS classes for trend indicators
     */
    getTrendClasses(trend) {
        const trendClasses = {
            'increasing': 'text-green-600 bg-green-100',
            'decreasing': 'text-red-600 bg-red-100',
            'stable': 'text-gray-600 bg-gray-100'
        };
        
        return trendClasses[trend] || 'text-gray-600 bg-gray-100';
    },
    
    /**
     * Gets trend icons
     */
    getTrendIcon(trend) {
        const trendIcons = {
            'increasing': '↗️',
            'decreasing': '↘️',
            'stable': '➡️'
        };
        
        return trendIcons[trend] || '➡️';
    },
    
    /**
     * Filters data by date range
     */
    filterByDateRange(data, startDate, endDate) {
        if (!data || !Array.isArray(data)) return [];
        
        const start = new Date(startDate);
        const end = new Date(endDate);
        
        return data.filter(item => {
            const itemDate = new Date(item.timestamp);
            return itemDate >= start && itemDate <= end;
        });
    },
    
    /**
     * Sorts data by specified field
     */
    sortData(data, field, direction = 'asc') {
        if (!data || !Array.isArray(data)) return [];
        
        return [...data].sort((a, b) => {
            let aVal = a[field];
            let bVal = b[field];
            
            // Handle string comparisons
            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (direction === 'desc') {
                return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
            } else {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            }
        });
    },
    
    /**
     * Calculates statistical metrics for a dataset
     */
    calculateStats(data, valueKey = 'value') {
        if (!data || !Array.isArray(data)) return null;
        
        const values = data.map(item => item[valueKey]).filter(val => typeof val === 'number');
        if (values.length === 0) return null;
        
        const sum = values.reduce((acc, val) => acc + val, 0);
        const mean = sum / values.length;
        const sortedValues = [...values].sort((a, b) => a - b);
        const median = sortedValues.length % 2 === 0
            ? (sortedValues[sortedValues.length / 2 - 1] + sortedValues[sortedValues.length / 2]) / 2
            : sortedValues[Math.floor(sortedValues.length / 2)];
        
        const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        return {
            count: values.length,
            sum,
            mean,
            median,
            min: Math.min(...values),
            max: Math.max(...values),
            stdDev,
            variance
        };
    },
    
    /**
     * Validates time range selection
     */
    validateTimeRange(timeRangeId) {
        const validRanges = this.getTimeRangeOptions().map(opt => opt.id);
        return validRanges.includes(timeRangeId);
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { performanceFilters };
} else if (typeof window !== 'undefined') {
    window.performanceFilters = performanceFilters;
}
