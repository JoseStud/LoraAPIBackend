/**
 * Dashboard Component for LoRA Manager
 * 
 * This component handles the main dashboard functionality,
 * including stats display, system health monitoring, and data refresh.
 */

import { fetchData } from '../../utils/api.js';

export function createDashboardComponent() {
    return {
        // Page-local loading state used by dashboard header actions
        loading: false,
        isInitialized: false,
        
        // Dashboard statistics
        stats: {
            total_loras: 0,
            active_loras: 0,
            embeddings_coverage: 0,
            recent_activities_count: 0,
            recent_imports: 0
        },
        
        // System health monitoring
        systemHealth: {
            status: 'unknown',
            gpu_status: '-' 
        },
        
        // Initialize the dashboard
        init() {
            this.loadInitialData();
            this.isInitialized = true;
        },
        
        // Load initial dashboard data
        async loadInitialData() {
            try {
                await this.refreshData();
            } catch (error) {
                // Silently handle errors - backend may be offline
                // Keep default values
            }
        },
        
        // Refresh dashboard data
        async refreshData() {
            if (this.loading) return;
            
            this.loading = true;
            
            try {
                const data = await fetchData('/api/v1/dashboard/stats');
                
                // Update stats if provided
                if (data.stats) {
                    this.stats = { ...this.stats, ...data.stats };
                }
                
                // Update system health if provided
                if (data.system_health) {
                    this.systemHealth = { ...this.systemHealth, ...data.system_health };
                }
            } catch (error) {
                // Handle network errors gracefully
                // Keep existing data, don't show error to user
            } finally {
                this.loading = false;
            }
        },
        
        // Format numbers for display
        formatNumber(num) {
            if (num === null || num === undefined) return '-';
            if (num >= 1000) {
                return (num / 1000).toFixed(1) + 'k';
            }
            return num.toString();
        },
        
        // Get status color class
        getStatusColor(status) {
            switch (status) {
                case 'healthy': return 'text-green-600';
                case 'warning': return 'text-yellow-600';
                case 'error': return 'text-red-600';
                default: return 'text-gray-600';
            }
        },
        
        // Get status icon class
        getStatusIconColor(status) {
            switch (status) {
                case 'healthy': return 'bg-green-100';
                case 'warning': return 'bg-yellow-100';
                case 'error': return 'bg-red-100';
                default: return 'bg-gray-100';
            }
        }
    };
}
