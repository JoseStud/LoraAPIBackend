/**
 * System Administration Alpine.js Component
 * Manages system monitoring, configuration, and maintenance operations
 */

import { fetchData, postData, putData, deleteData } from '../utils/api.js';

function systemAdmin() {
    return {
        // State
        activeTab: 'monitoring',
        isRefreshing: false,
        showMaintenance: false,
        showToast: false,
        toastMessage: '',
        toastType: 'success',
        
        // System Status
        systemStatus: {
            overall: 'healthy', // healthy, warning, error
            last_check: new Date().toISOString()
        },
        
        // System Statistics
        systemStats: {
            uptime: '0d 0h 0m',
            active_workers: 0,
            total_workers: 0,
            database_size: 0,
            total_records: 0,
            gpu_memory_used: '0GB',
            gpu_memory_total: '0GB'
        },
        
        // Real-time Metrics
        systemMetrics: {
            cpu_percent: 0,
            memory_percent: 0,
            memory_used: 0,
            disk_percent: 0,
            disk_used: 0,
            gpus: []
        },
        
        // Workers
        workers: [],
        
        // Database Stats
        dbStats: {
            total_loras: 0,
            total_generations: 0,
            database_size: 0
        },
        
        // Configuration
        config: {
            max_concurrent_jobs: 4,
            generation_timeout: 30,
            cleanup_period: 30,
            log_level: 'INFO',
            gpu_memory_optimization: 'auto',
            precision_mode: 'fp16',
            enable_gpu_monitoring: true,
            max_storage_size: 100,
            image_quality: 'high',
            auto_backup: false
        },
        
        // Logs
        logs: [],
        filteredLogs: [],
        logLevel: 'all',
        logSource: 'all',
        autoRefreshLogs: false,
        logRefreshInterval: null,
        
        // Backup
        recentBackups: [],
        isBackingUp: false,
        isOptimizing: false,
        
        // Maintenance
        maintenanceMessage: '',
        
        /**
         * Initialize the component
         */
        async init() {
            await this.loadSystemData();
            this.startRealTimeUpdates();
        },
        
        /**
         * Load all system data
         */
        async loadSystemData() {
            await Promise.all([
                this.loadSystemStatus(),
                this.loadSystemStats(),
                this.loadSystemMetrics(),
                this.loadWorkers(),
                this.loadDatabaseStats(),
                this.loadConfiguration(),
                this.loadLogs(),
                this.loadRecentBackups()
            ]);
        },
        
        /**
         * Start real-time updates
         */
        startRealTimeUpdates() {
            // Update metrics every 5 seconds
            setInterval(() => {
                this.loadSystemMetrics();
                this.loadWorkers();
            }, 5000);
            
            // Update stats every 30 seconds
            setInterval(() => {
                this.loadSystemStats();
                this.loadDatabaseStats();
            }, 30000);
        },
        
        /**
         * Load system status
         */
        async loadSystemStatus() {
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/admin/system/status');
                this.systemStatus = data;
            } catch (error) {
                console.error('Error loading system status:', error);
                this.systemStatus.overall = 'error';
            }
        },
        
        /**
         * Load system statistics
         */
        async loadSystemStats() {
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/admin/system/stats');
                this.systemStats = data;
            } catch (error) {
                console.error('Error loading system stats:', error);
                this.showToastMessage('Failed to load system statistics', 'error');
            }
        },
        
        /**
         * Load real-time system metrics
         */
        async loadSystemMetrics() {
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/admin/system/metrics');
                this.systemMetrics = data;
                // Update system status based on metrics
                this.updateSystemStatus();
            } catch (error) {
                console.error('Error loading system metrics:', error);
            }
        },
        
        /**
         * Update system status based on current metrics
         */
        updateSystemStatus() {
            const { cpu_percent, memory_percent, disk_percent, gpus } = this.systemMetrics;
            
            // Check for critical conditions
            if (cpu_percent > 90 || memory_percent > 95 || disk_percent > 95) {
                this.systemStatus.overall = 'error';
                return;
            }
            
            // Check GPU temperature and memory
            const gpuIssues = gpus.some(gpu => gpu.temperature > 85 || gpu.memory_percent > 95);
            if (gpuIssues) {
                this.systemStatus.overall = 'error';
                return;
            }
            
            // Check for warning conditions
            if (cpu_percent > 75 || memory_percent > 85 || disk_percent > 85) {
                this.systemStatus.overall = 'warning';
                return;
            }
            
            // Check GPU warnings
            const gpuWarnings = gpus.some(gpu => gpu.temperature > 75 || gpu.memory_percent > 85);
            if (gpuWarnings) {
                this.systemStatus.overall = 'warning';
                return;
            }
            
            this.systemStatus.overall = 'healthy';
        },
        
        /**
         * Load workers information
         */
        async loadWorkers() {
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/admin/workers');
                this.workers = data;
            } catch (error) {
                console.error('Error loading workers:', error);
                this.showToastMessage('Failed to load worker information', 'error');
            }
        },
        
        /**
         * Load database statistics
         */
        async loadDatabaseStats() {
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/admin/database/stats');
                this.dbStats = data;
            } catch (error) {
                console.error('Error loading database stats:', error);
                this.showToastMessage('Failed to load database statistics', 'error');
            }
        },
        
        /**
         * Load system configuration
         */
        async loadConfiguration() {
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/admin/config');
                this.config = { ...this.config, ...data };
            } catch (error) {
                console.error('Error loading configuration:', error);
                this.showToastMessage('Failed to load configuration', 'error');
            }
        },
        
        /**
         * Load system logs
         */
        async loadLogs() {
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/admin/logs?limit=500');
                this.logs = data;
                this.filterLogs();
            } catch (error) {
                console.error('Error loading logs:', error);
                this.showToastMessage('Failed to load system logs', 'error');
            }
        },
        
        /**
         * Load recent backups
         */
        async loadRecentBackups() {
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/admin/backups');
                this.recentBackups = data;
            } catch (error) {
                console.error('Error loading backups:', error);
                this.showToastMessage('Failed to load backup history', 'error');
            }
        },
        
        /**
         * Refresh all data
         */
        async refreshAllData() {
            this.isRefreshing = true;
            try {
                await this.loadSystemData();
                this.showToastMessage('System data refreshed successfully');
            } catch (error) {
                this.showToastMessage('Failed to refresh system data', 'error');
            } finally {
                this.isRefreshing = false;
            }
        },
        
        /**
         * Scale workers up or down
         */
        async scaleWorkers(direction) {
            try {
                const endpoint = direction === 'up' ? 'add' : 'remove';
                await postData((window?.BACKEND_URL || '') + `/admin/workers/${endpoint}`);
                await this.loadWorkers();
                this.showToastMessage(`Worker ${direction === 'up' ? 'added' : 'removed'} successfully`);
                
            } catch (error) {
                console.error('Error scaling workers:', error);
                this.showToastMessage('Failed to scale workers', 'error');
            }
        },
        
        /**
         * Restart all workers
         */
        async restartAllWorkers() {
            if (!confirm('Are you sure you want to restart all workers? This may interrupt ongoing generations.')) {
                return;
            }
            
            try {
                await postData((window?.BACKEND_URL || '') + '/admin/workers/restart-all');
                await this.loadWorkers();
                this.showToastMessage('All workers restarted successfully');
                
            } catch (error) {
                console.error('Error restarting workers:', error);
                this.showToastMessage('Failed to restart workers', 'error');
            }
        },
        
        /**
         * Restart a specific worker
         */
        async restartWorker(workerId) {
            try {
                await postData((window?.BACKEND_URL || '') + `/admin/workers/${workerId}/restart`);
                await this.loadWorkers();
                this.showToastMessage(`Worker ${workerId} restarted successfully`);
                
            } catch (error) {
                console.error('Error restarting worker:', error);
                this.showToastMessage('Failed to restart worker', 'error');
            }
        },
        
        /**
         * Stop a specific worker
         */
        async stopWorker(workerId) {
            if (!confirm(`Are you sure you want to stop worker ${workerId}?`)) {
                return;
            }
            
            try {
                await postData((window?.BACKEND_URL || '') + `/admin/workers/${workerId}/stop`);
                await this.loadWorkers();
                this.showToastMessage(`Worker ${workerId} stopped successfully`);
                
            } catch (error) {
                console.error('Error stopping worker:', error);
                this.showToastMessage('Failed to stop worker', 'error');
            }
        },
        
        /**
         * Create database backup
         */
        async createBackup() {
            this.isBackingUp = true;
            try {
                await postData((window?.BACKEND_URL || '') + '/admin/database/backup');
                await this.loadRecentBackups();
                this.showToastMessage('Database backup created successfully');
                
            } catch (error) {
                console.error('Error creating backup:', error);
                this.showToastMessage('Failed to create database backup', 'error');
            } finally {
                this.isBackingUp = false;
            }
        },
        
        /**
         * Handle backup file selection
         */
        async handleBackupFile(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            if (!confirm('Restoring from backup will overwrite the current database. Are you sure?')) {
                event.target.value = '';
                return;
            }
            
            try {
                const formData = new FormData();
                formData.append('backup_file', file);
                
                const response = await fetch((window?.BACKEND_URL || '') + '/admin/database/restore', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) throw new Error('Failed to restore backup');
                
                this.showToastMessage('Database restored successfully. Please refresh the page.');
                
            } catch (error) {
                console.error('Error restoring backup:', error);
                this.showToastMessage('Failed to restore database backup', 'error');
            } finally {
                event.target.value = '';
            }
        },
        
        /**
         * Download backup file
         */
        async downloadBackup(backupId) {
            try {
                const response = await fetch((window?.BACKEND_URL || '') + `/admin/backups/${backupId}/download`);
                if (!response.ok) throw new Error('Failed to download backup');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `backup-${backupId}.sql`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showToastMessage('Backup download started');
                
            } catch (error) {
                console.error('Error downloading backup:', error);
                this.showToastMessage('Failed to download backup', 'error');
            }
        },
        
        /**
         * Delete backup
         */
        async deleteBackup(backupId) {
            if (!confirm('Are you sure you want to delete this backup?')) {
                return;
            }
            
            try {
                await deleteData((window?.BACKEND_URL || '') + `/admin/backups/${backupId}`);
                await this.loadRecentBackups();
                this.showToastMessage('Backup deleted successfully');
                
            } catch (error) {
                console.error('Error deleting backup:', error);
                this.showToastMessage('Failed to delete backup', 'error');
            }
        },
        
        /**
         * Optimize database
         */
        async optimizeDatabase() {
            this.isOptimizing = true;
            try {
                await postData((window?.BACKEND_URL || '') + '/admin/database/optimize');
                await this.loadDatabaseStats();
                this.showToastMessage('Database optimized successfully');
                
            } catch (error) {
                console.error('Error optimizing database:', error);
                this.showToastMessage('Failed to optimize database', 'error');
            } finally {
                this.isOptimizing = false;
            }
        },
        
        /**
         * Rebuild search indexes
         */
        async rebuildIndexes() {
            try {
                await postData((window?.BACKEND_URL || '') + '/admin/database/rebuild-indexes');
                this.showToastMessage('Search indexes rebuilt successfully');
                
            } catch (error) {
                console.error('Error rebuilding indexes:', error);
                this.showToastMessage('Failed to rebuild indexes', 'error');
            }
        },
        
        /**
         * Cleanup orphaned files
         */
        async cleanupOrphaned() {
            if (!confirm('This will remove files that are no longer referenced in the database. Continue?')) {
                return;
            }
            
            try {
                const data = await postData((window?.BACKEND_URL || '') + '/admin/database/cleanup-orphaned');
                this.showToastMessage(`Cleaned up ${data.files_removed ?? 0} orphaned files`);
                
            } catch (error) {
                console.error('Error cleaning up orphaned files:', error);
                this.showToastMessage('Failed to cleanup orphaned files', 'error');
            }
        },
        
        /**
         * Validate data integrity
         */
        async validateData() {
            try {
                const data = await postData((window?.BACKEND_URL || '') + '/admin/database/validate');
                if (data.issues_found > 0) {
                    this.showToastMessage(`Validation completed. ${data.issues_found} issues found.`, 'warning');
                } else {
                    this.showToastMessage('Data validation passed. No issues found.');
                }
                
            } catch (error) {
                console.error('Error validating data:', error);
                this.showToastMessage('Failed to validate data integrity', 'error');
            }
        },
        
        /**
         * Save configuration
         */
        async saveConfiguration() {
            try {
                await putData((window?.BACKEND_URL || '') + '/admin/config', this.config);
                this.showToastMessage('Configuration saved successfully');
                
            } catch (error) {
                console.error('Error saving configuration:', error);
                this.showToastMessage('Failed to save configuration', 'error');
            }
        },
        
        /**
         * Reset configuration to defaults
         */
        async resetConfiguration() {
            if (!confirm('Are you sure you want to reset all configuration to defaults?')) {
                return;
            }
            
            try {
                await postData((window?.BACKEND_URL || '') + '/admin/config/reset');
                await this.loadConfiguration();
                this.showToastMessage('Configuration reset to defaults');
                
            } catch (error) {
                console.error('Error resetting configuration:', error);
                this.showToastMessage('Failed to reset configuration', 'error');
            }
        },
        
        /**
         * Filter logs based on level and source
         */
        filterLogs() {
            let filtered = [...this.logs];
            
            // Filter by level
            if (this.logLevel !== 'all') {
                const levelPriority = { DEBUG: 0, INFO: 1, WARNING: 2, ERROR: 3 };
                const minPriority = levelPriority[this.logLevel];
                filtered = filtered.filter(log => levelPriority[log.level] >= minPriority);
            }
            
            // Filter by source
            if (this.logSource !== 'all') {
                filtered = filtered.filter(log => log.source === this.logSource);
            }
            
            this.filteredLogs = filtered;
        },
        
        /**
         * Toggle auto-refresh for logs
         */
        toggleAutoRefresh() {
            if (this.autoRefreshLogs) {
                this.logRefreshInterval = setInterval(() => {
                    this.loadLogs();
                }, 5000);
            } else {
                if (this.logRefreshInterval) {
                    clearInterval(this.logRefreshInterval);
                    this.logRefreshInterval = null;
                }
            }
        },
        
        /**
         * Refresh logs manually
         */
        async refreshLogs() {
            await this.loadLogs();
            this.showToastMessage('Logs refreshed');
        },
        
        /**
         * Clear system logs
         */
        async clearLogs() {
            if (!confirm('Are you sure you want to clear all system logs?')) {
                return;
            }
            
            try {
                await deleteData((window?.BACKEND_URL || '') + '/admin/logs');
                this.logs = [];
                this.filteredLogs = [];
                this.showToastMessage('System logs cleared');
                
            } catch (error) {
                console.error('Error clearing logs:', error);
                this.showToastMessage('Failed to clear logs', 'error');
            }
        },
        
        /**
         * Download logs
         */
        async downloadLogs() {
            try {
                const params = new URLSearchParams({
                    level: this.logLevel,
                    source: this.logSource
                });
                
                const response = await fetch((window?.BACKEND_URL || '') + `/admin/logs/download?${params}`);
                if (!response.ok) throw new Error('Failed to download logs');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `system-logs-${new Date().toISOString().split('T')[0]}.txt`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showToastMessage('Log download started');
                
            } catch (error) {
                console.error('Error downloading logs:', error);
                this.showToastMessage('Failed to download logs', 'error');
            }
        },
        
        /**
         * Enable maintenance mode
         */
        async enableMaintenanceMode() {
            try {
                await postData((window?.BACKEND_URL || '') + '/admin/maintenance', {
                    enabled: true,
                    message: this.maintenanceMessage
                });
                this.showMaintenance = false;
                this.showToastMessage('Maintenance mode enabled');
                
            } catch (error) {
                console.error('Error enabling maintenance mode:', error);
                this.showToastMessage('Failed to enable maintenance mode', 'error');
            }
        },
        
        /**
         * Format file size for display
         */
        formatSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },
        
        /**
         * Format date for display
         */
        formatDate(dateString) {
            return new Date(dateString).toLocaleString();
        },
        
        /**
         * Format log timestamp
         */
        formatLogTime(timestamp) {
            const date = new Date(timestamp);
            return date.toTimeString().split(' ')[0];
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
        }
    };
}
