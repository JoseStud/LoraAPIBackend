/**
 * System Administration API Module
 * 
 * Handles all HTTP requests to the admin API endpoints.
 * Provides a clean interface for system monitoring, configuration, and maintenance operations.
 */

/**
 * API client for system administration endpoints
 */
class SystemAdminAPI {
    constructor() {
        this.baseUrl = '/api/v1/admin';
    }

    /**
     * Make a generic API request with error handling
     * @param {string} endpoint - API endpoint relative to baseUrl
     * @param {Object} options - Fetch options
     * @returns {Promise<Object>} Response data
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        try {
            const response = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorData}`);
            }

            // Handle empty responses
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            } else {
                return await response.text();
            }
        } catch (error) {
            if (window.DevLogger && window.DevLogger.error) {
                window.DevLogger.error(`API request failed: ${endpoint}`, error);
            }
            throw error;
        }
    }

    // System Status and Stats
    /**
     * Get system status
     * @returns {Promise<Object>} System status data
     */
    async getSystemStatus() {
        return await this.request('/system/status');
    }

    /**
     * Get system statistics
     * @returns {Promise<Object>} System stats data
     */
    async getSystemStats() {
        return await this.request('/system/stats');
    }

    /**
     * Get real-time system metrics
     * @returns {Promise<Object>} System metrics data
     */
    async getSystemMetrics() {
        return await this.request('/system/metrics');
    }

    // Workers Management
    /**
     * Get all workers
     * @returns {Promise<Array>} Array of worker objects
     */
    async getWorkers() {
        return await this.request('/workers');
    }

    /**
     * Start or stop workers
     * @param {string} action - 'start' or 'stop'
     * @returns {Promise<Object>} Operation result
     */
    async controlWorkers(action) {
        const endpoint = action === 'start' ? '/workers/start' : '/workers/stop';
        return await this.request(endpoint, { method: 'POST' });
    }

    /**
     * Restart all workers
     * @returns {Promise<Object>} Operation result
     */
    async restartAllWorkers() {
        return await this.request('/workers/restart-all', { method: 'POST' });
    }

    /**
     * Restart a specific worker
     * @param {string} workerId - Worker ID to restart
     * @returns {Promise<Object>} Operation result
     */
    async restartWorker(workerId) {
        return await this.request(`/workers/${workerId}/restart`, { method: 'POST' });
    }

    /**
     * Stop a specific worker
     * @param {string} workerId - Worker ID to stop
     * @returns {Promise<Object>} Operation result
     */
    async stopWorker(workerId) {
        return await this.request(`/workers/${workerId}/stop`, { method: 'POST' });
    }

    // Database Management
    /**
     * Get database statistics
     * @returns {Promise<Object>} Database stats
     */
    async getDatabaseStats() {
        return await this.request('/database/stats');
    }

    /**
     * Create database backup
     * @returns {Promise<Object>} Backup operation result
     */
    async createBackup() {
        return await this.request('/database/backup', { method: 'POST' });
    }

    /**
     * Restore database from backup
     * @param {string} backupId - Backup ID to restore
     * @returns {Promise<Object>} Restore operation result
     */
    async restoreBackup(backupId) {
        return await this.request('/database/restore', {
            method: 'POST',
            body: JSON.stringify({ backup_id: backupId })
        });
    }

    /**
     * Download backup file
     * @param {string} backupId - Backup ID to download
     * @returns {Promise<Blob>} Backup file blob
     */
    async downloadBackup(backupId) {
        const response = await fetch(`${this.baseUrl}/backups/${backupId}/download`);
        if (!response.ok) {
            throw new Error(`Failed to download backup: ${response.status}`);
        }
        return await response.blob();
    }

    /**
     * Delete a backup
     * @param {string} backupId - Backup ID to delete
     * @returns {Promise<Object>} Delete operation result
     */
    async deleteBackup(backupId) {
        return await this.request(`/backups/${backupId}`, { method: 'DELETE' });
    }

    /**
     * Optimize database
     * @returns {Promise<Object>} Optimization result
     */
    async optimizeDatabase() {
        return await this.request('/database/optimize', { method: 'POST' });
    }

    /**
     * Rebuild database indexes
     * @returns {Promise<Object>} Rebuild operation result
     */
    async rebuildIndexes() {
        return await this.request('/database/rebuild-indexes', { method: 'POST' });
    }

    /**
     * Cleanup orphaned records
     * @returns {Promise<Object>} Cleanup operation result
     */
    async cleanupOrphaned() {
        return await this.request('/database/cleanup-orphaned', { method: 'POST' });
    }

    /**
     * Validate database integrity
     * @returns {Promise<Object>} Validation result
     */
    async validateDatabase() {
        return await this.request('/database/validate', { method: 'POST' });
    }

    // Configuration Management
    /**
     * Get system configuration
     * @returns {Promise<Object>} Configuration data
     */
    async getConfiguration() {
        return await this.request('/config');
    }

    /**
     * Update system configuration
     * @param {Object} config - Configuration object to update
     * @returns {Promise<Object>} Update result
     */
    async updateConfiguration(config) {
        return await this.request('/config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });
    }

    // Logs Management
    /**
     * Get system logs
     * @param {Object} options - Query options (limit, level, source)
     * @returns {Promise<Array>} Array of log entries
     */
    async getLogs(options = {}) {
        const params = new URLSearchParams();
        
        if (options.limit) params.append('limit', options.limit);
        if (options.level && options.level !== 'all') params.append('level', options.level);
        if (options.source && options.source !== 'all') params.append('source', options.source);
        
        const queryString = params.toString();
        const endpoint = queryString ? `/logs?${queryString}` : '/logs';
        
        return await this.request(endpoint);
    }

    // Backup Management
    /**
     * Get recent backups
     * @returns {Promise<Array>} Array of backup objects
     */
    async getRecentBackups() {
        return await this.request('/backups');
    }

    // Health and Monitoring
    /**
     * Get comprehensive health report
     * @returns {Promise<Object>} Health report data
     */
    async getHealthReport() {
        return await this.request('/health/report');
    }

    /**
     * Check specific system component health
     * @param {string} component - Component to check (database, workers, storage, etc.)
     * @returns {Promise<Object>} Component health status
     */
    async checkComponentHealth(component) {
        return await this.request(`/health/${component}`);
    }
}

// Export singleton instance
const systemAdminAPI = new SystemAdminAPI();

// Make available globally and for module export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SystemAdminAPI, systemAdminAPI };
} else if (typeof window !== 'undefined') {
    window.systemAdminAPI = systemAdminAPI;
    window.SystemAdminAPI = SystemAdminAPI;
}
