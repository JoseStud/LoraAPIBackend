/**
 * System Status Component
 * 
 * Displays system health and GPU status.
 * Uses the global store for system data.
 */

export function createSystemStatusComponent() {
    return {
        isInitialized: false,
        
        // Local UI state
        expanded: false,
        lastUpdate: null,
        statusInterval: null,
        apiAvailable: true, // Flag to disable polling after 404
        
        init() {
            this.loadSystemStatus();
            this.startStatusPolling();
            this.isInitialized = true;
        },
        
        // Load initial system status
        async loadSystemStatus() {
            try {
                const response = await fetch('/api/v1/system/status');
                if (response.ok) {
                    const status = await response.json();
                    this.$store.app.updateSystemStatus(status);
                    this.lastUpdate = new Date();
                } else if (response.status === 404) {
                    // API endpoint not implemented yet, use default status and stop polling
                    this.apiAvailable = false;
                    this.$store.app.updateSystemStatus({
                        gpu_status: 'Available',
                        memory_used: 2048,
                        memory_total: 8192,
                        status: 'Ready'
                    });
                    if (this.statusInterval) {
                        clearInterval(this.statusInterval);
                        this.statusInterval = null;
                    }
                }
            } catch (error) {
                // Handle error silently, show in UI
                this.$store.app.updateSystemStatus({
                    status: 'error',
                    gpu_status: 'Unknown'
                });
            }
        },
        
        // Start polling for status updates
        startStatusPolling() {
            if (!this.apiAvailable) return; // Skip if API is not available
            
            const statusInterval = setInterval(async () => {
                if (!this.apiAvailable) {
                    clearInterval(statusInterval);
                    return;
                }
                await this.loadSystemStatus();
            }, 10000); // Every 10 seconds
            
            this.statusInterval = statusInterval;
        },
        
        // Toggle expanded view
        toggleExpanded() {
            this.expanded = !this.expanded;
        },
        
        // Get status icon
        getStatusIcon(status) {
            switch (status) {
                case 'healthy': return '✅';
                case 'warning': return '⚠️';
                case 'error': return '❌';
                default: return '❓';
            }
        },
        
        // Get GPU status color
        getGpuStatusColor(gpuStatus) {
            if (gpuStatus && gpuStatus.toLowerCase().includes('available')) {
                return 'text-green-600';
            } else if (gpuStatus && gpuStatus.toLowerCase().includes('busy')) {
                return 'text-yellow-600';
            } else {
                return 'text-red-600';
            }
        },
        
        // Format memory usage
        formatMemory(used, total) {
            if (!used || !total) return 'N/A';
            const usedGB = (used / 1024).toFixed(1);
            const totalGB = (total / 1024).toFixed(1);
            const percentage = ((used / total) * 100).toFixed(0);
            return `${usedGB}GB / ${totalGB}GB (${percentage}%)`;
        },
        
        // Format last update time
        formatLastUpdate() {
            if (!this.lastUpdate) return 'Never';
            const now = new Date();
            const diffSecs = Math.floor((now - this.lastUpdate) / 1000);
            
            if (diffSecs < 60) return `${diffSecs}s ago`;
            const diffMins = Math.floor(diffSecs / 60);
            if (diffMins < 60) return `${diffMins}m ago`;
            const diffHours = Math.floor(diffMins / 60);
            return `${diffHours}h ago`;
        },
        
        // Computed properties
        get systemStatus() {
            return this.$store.app.systemStatus;
        },
        
        get isHealthy() {
            return this.systemStatus.status === 'healthy';
        },
        
        get gpuAvailable() {
            return this.systemStatus.gpu_available;
        },
        
        get queueLength() {
            return this.systemStatus.queue_length || 0;
        },
        
        // Cleanup
        destroy() {
            if (this.statusInterval) {
                clearInterval(this.statusInterval);
            }
        }
    };
}
