/**
 * Performance Analytics - Export Operations Module
 * 
 * Handles data export functionality in various formats.
 */

/**
 * Export operations for performance analytics
 */
const performanceExports = {
    /**
     * Exports analytics data in specified format
     */
    async exportData(format, timeRange, data) {
        try {
            switch (format.toLowerCase()) {
                case 'json':
                    return await this.exportAsJSON(data, timeRange);
                case 'csv':
                    return await this.exportAsCSV(data, timeRange);
                case 'pdf':
                    return await this.exportAsPDF(data, timeRange);
                default:
                    throw new Error(`Unsupported export format: ${format}`);
            }
        } catch (error) {
            throw new Error(`Export failed: ${error.message}`);
        }
    },
    
    /**
     * Exports data as JSON
     */
    async exportAsJSON(data, timeRange) {
        const exportData = {
            metadata: {
                exported_at: new Date().toISOString(),
                time_range: timeRange,
                format: 'json',
                version: '1.0'
            },
            analytics: {
                kpis: data.kpis || {},
                top_loras: data.topLoras || [],
                error_analysis: data.errorAnalysis || [],
                performance_insights: data.performanceInsights || [],
                chart_data: data.chartData || {}
            }
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
            type: 'application/json'
        });
        
        const filename = `analytics_${timeRange}_${new Date().toISOString().slice(0, 10)}.json`;
        return this.downloadBlob(blob, filename);
    },
    
    /**
     * Exports data as CSV
     */
    async exportAsCSV(data, timeRange) {
        const csvData = [];
        
        // Add metadata header
        csvData.push(['Analytics Export']);
        csvData.push(['Exported At', new Date().toISOString()]);
        csvData.push(['Time Range', timeRange]);
        csvData.push(['']);
        
        // Add KPIs section
        if (data.kpis) {
            csvData.push(['Key Performance Indicators']);
            csvData.push(['Metric', 'Value']);
            Object.entries(data.kpis).forEach(([key, value]) => {
                csvData.push([this.formatMetricName(key), value]);
            });
            csvData.push(['']);
        }
        
        // Add top LoRAs section
        if (data.topLoras && data.topLoras.length > 0) {
            csvData.push(['Top Performing LoRAs']);
            csvData.push(['Name', 'Version', 'Usage Count', 'Success Rate (%)', 'Avg Time (s)']);
            data.topLoras.forEach(lora => {
                csvData.push([
                    lora.name,
                    lora.version,
                    lora.usage_count,
                    lora.success_rate,
                    lora.avg_time
                ]);
            });
            csvData.push(['']);
        }
        
        // Add error analysis section
        if (data.errorAnalysis && data.errorAnalysis.length > 0) {
            csvData.push(['Error Analysis']);
            csvData.push(['Error Type', 'Count', 'Percentage (%)', 'Trend']);
            data.errorAnalysis.forEach(error => {
                csvData.push([
                    error.error_type,
                    error.count,
                    error.percentage,
                    error.trend
                ]);
            });
            csvData.push(['']);
        }
        
        // Add generation volume data
        if (data.chartData && data.chartData.generationVolume) {
            csvData.push(['Generation Volume Over Time']);
            csvData.push(['Timestamp', 'Count']);
            data.chartData.generationVolume.forEach(item => {
                csvData.push([
                    new Date(item.timestamp).toISOString(),
                    item.count
                ]);
            });
        }
        
        const csvContent = csvData.map(row => 
            row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
        ).join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const filename = `analytics_${timeRange}_${new Date().toISOString().slice(0, 10)}.csv`;
        return this.downloadBlob(blob, filename);
    },
    
    /**
     * Exports data as PDF report
     */
    async exportAsPDF(data, timeRange) {
        // This would typically use a library like jsPDF
        // For now, we'll create a mock implementation
        
        const reportData = this.generateReportContent(data, timeRange);
        
        // Mock PDF generation - in reality, you'd use jsPDF or similar
        const pdfContent = `
Analytics Report - ${timeRange}
Generated: ${new Date().toISOString()}

${reportData}
        `.trim();
        
        const blob = new Blob([pdfContent], { type: 'text/plain' });
        const filename = `analytics_report_${timeRange}_${new Date().toISOString().slice(0, 10)}.txt`;
        return this.downloadBlob(blob, filename);
    },
    
    /**
     * Generates report content for PDF export
     */
    generateReportContent(data, _timeRange) {
        let content = '';
        
        // KPIs summary
        if (data.kpis) {
            content += 'KEY PERFORMANCE INDICATORS\n';
            content += '===========================\n';
            Object.entries(data.kpis).forEach(([key, value]) => {
                content += `${this.formatMetricName(key)}: ${value}\n`;
            });
            content += '\n';
        }
        
        // Top LoRAs
        if (data.topLoras && data.topLoras.length > 0) {
            content += 'TOP PERFORMING LORAS\n';
            content += '===================\n';
            data.topLoras.slice(0, 5).forEach((lora, index) => {
                content += `${index + 1}. ${lora.name} (${lora.version})\n`;
                content += `   Usage: ${lora.usage_count} times\n`;
                content += `   Success Rate: ${lora.success_rate}%\n`;
                content += `   Avg Time: ${lora.avg_time}s\n\n`;
            });
        }
        
        // Performance insights
        if (data.performanceInsights && data.performanceInsights.length > 0) {
            content += 'PERFORMANCE INSIGHTS\n';
            content += '==================\n';
            data.performanceInsights.forEach((insight, index) => {
                content += `${index + 1}. ${insight.title}\n`;
                content += `   ${insight.description}\n`;
                content += `   Impact: ${insight.impact}\n\n`;
            });
        }
        
        return content;
    },
    
    /**
     * Downloads a blob as a file
     */
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        return url;
    },
    
    /**
     * Formats metric names for display
     */
    formatMetricName(key) {
        return key.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    },
    
    /**
     * Prepares chart data for export
     */
    prepareChartDataForExport(charts) {
        const exportData = {};
        
        Object.entries(charts).forEach(([name, chart]) => {
            if (chart && chart.data) {
                exportData[name] = {
                    labels: [...chart.data.labels],
                    datasets: chart.data.datasets.map(dataset => ({
                        label: dataset.label,
                        data: [...dataset.data]
                    }))
                };
            }
        });
        
        return exportData;
    },
    
    /**
     * Validates export data
     */
    validateExportData(data) {
        const issues = [];
        
        if (!data || typeof data !== 'object') {
            issues.push('Export data is missing or invalid');
            return issues;
        }
        
        if (!data.kpis || Object.keys(data.kpis).length === 0) {
            issues.push('KPIs data is missing');
        }
        
        if (!data.chartData || Object.keys(data.chartData).length === 0) {
            issues.push('Chart data is missing');
        }
        
        return issues;
    },
    
    /**
     * Gets supported export formats
     */
    getSupportedFormats() {
        return [
            { id: 'json', name: 'JSON', description: 'Machine-readable data format' },
            { id: 'csv', name: 'CSV', description: 'Spreadsheet-compatible format' },
            { id: 'pdf', name: 'PDF', description: 'Formatted report document' }
        ];
    },
    
    /**
     * Estimates export file size
     */
    estimateExportSize(data, format) {
        const dataSize = JSON.stringify(data).length;
        
        switch (format.toLowerCase()) {
            case 'json':
                return Math.round(dataSize * 1.1); // JSON overhead
            case 'csv':
                return Math.round(dataSize * 0.7); // CSV more compact
            case 'pdf':
                return Math.round(dataSize * 1.5); // PDF larger due to formatting
            default:
                return dataSize;
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { performanceExports };
} else if (typeof window !== 'undefined') {
    window.performanceExports = performanceExports;
}
