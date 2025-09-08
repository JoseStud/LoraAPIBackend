/**
 * System Administration Backup Module
 * 
 * Handles backup creation, restoration, management, and monitoring
 * for the system administration component.
 */

/**
 * Backup manager for system administration
 */
class SystemBackupManager {
    constructor(api, showToast) {
        this.api = api;
        this.showToast = showToast;
        this.backupProgress = 0;
        this.restoreProgress = 0;
        this.currentOperation = null;
    }

    /**
     * Load backup history
     * @param {Object} state - Component state object
     */
    async loadBackupHistory(state) {
        try {
            state.ui.loadingStates.backups = true;
            const backups = await this.api.getRecentBackups();
            state.backup.recentBackups = backups;
            return backups;
        } catch (error) {
            this.handleError('Failed to load backup history', error);
            throw error;
        } finally {
            state.ui.loadingStates.backups = false;
        }
    }

    /**
     * Create a new backup
     * @param {Object} state - Component state object
     * @param {Object} _options - Backup options (future use)
     */
    async createBackup(state, _options = {}) {
        if (state.backup.isBackingUp) {
            this.showToast('Backup already in progress', 'warning');
            return;
        }

        try {
            state.backup.isBackingUp = true;
            state.backup.backupProgress = 0;
            this.currentOperation = 'backup';

            // Start progress simulation
            this.simulateProgress(state, 'backup');

            // Create the backup
            const result = await this.api.createBackup();
            
            state.backup.backupProgress = 100;
            
            // Refresh backup history
            await this.loadBackupHistory(state);
            
            this.showToast('Backup created successfully', 'success');
            return result;

        } catch (error) {
            this.handleError('Failed to create backup', error);
            this.showToast('Backup creation failed', 'error');
            throw error;
        } finally {
            state.backup.isBackingUp = false;
            state.backup.backupProgress = 0;
            this.currentOperation = null;
        }
    }

    /**
     * Restore from backup
     * @param {Object} state - Component state object
     * @param {string} backupId - Backup ID to restore
     */
    async restoreBackup(state, backupId) {
        if (!backupId) {
            this.showToast('Please select a backup to restore', 'warning');
            return;
        }

        // Confirm the restore operation
        const confirmed = await this.confirmRestore(backupId);
        if (!confirmed) {
            return;
        }

        try {
            state.backup.isRestoring = true;
            state.backup.restoreProgress = 0;
            this.currentOperation = 'restore';

            // Start progress simulation
            this.simulateProgress(state, 'restore');

            // Perform the restore
            const result = await this.api.restoreBackup(backupId);
            
            state.backup.restoreProgress = 100;
            
            this.showToast('Backup restored successfully. System may need restart.', 'success');
            return result;

        } catch (error) {
            this.handleError('Failed to restore backup', error);
            this.showToast('Backup restoration failed', 'error');
            throw error;
        } finally {
            state.backup.isRestoring = false;
            state.backup.restoreProgress = 0;
            this.currentOperation = null;
        }
    }

    /**
     * Download a backup file
     * @param {Object} state - Component state object
     * @param {string} backupId - Backup ID to download
     */
    async downloadBackup(state, backupId) {
        try {
            const blob = await this.api.downloadBackup(backupId);
            
            // Create download link
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `backup-${backupId}.zip`;
            
            // Trigger download
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up
            window.URL.revokeObjectURL(url);
            
            this.showToast('Backup download started', 'success');

        } catch (error) {
            this.handleError('Failed to download backup', error);
            this.showToast('Backup download failed', 'error');
            throw error;
        }
    }

    /**
     * Delete a backup
     * @param {Object} state - Component state object
     * @param {string} backupId - Backup ID to delete
     */
    async deleteBackup(state, backupId) {
        // Confirm deletion
        const confirmed = await this.confirmDelete(backupId);
        if (!confirmed) {
            return;
        }

        try {
            await this.api.deleteBackup(backupId);
            
            // Remove from local state
            state.backup.recentBackups = state.backup.recentBackups.filter(
                backup => backup.id !== backupId
            );
            
            this.showToast('Backup deleted successfully', 'success');

        } catch (error) {
            this.handleError('Failed to delete backup', error);
            this.showToast('Backup deletion failed', 'error');
            throw error;
        }
    }

    /**
     * Optimize database
     * @param {Object} state - Component state object
     */
    async optimizeDatabase(state) {
        if (state.backup.isOptimizing) {
            this.showToast('Database optimization already in progress', 'warning');
            return;
        }

        try {
            state.backup.isOptimizing = true;
            
            const result = await this.api.optimizeDatabase();
            
            this.showToast('Database optimization completed', 'success');
            return result;

        } catch (error) {
            this.handleError('Failed to optimize database', error);
            this.showToast('Database optimization failed', 'error');
            throw error;
        } finally {
            state.backup.isOptimizing = false;
        }
    }

    /**
     * Rebuild database indexes
     * @param {Object} _state - Component state object
     */
    async rebuildIndexes(_state) {
        try {
            const result = await this.api.rebuildIndexes();
            this.showToast('Database indexes rebuilt successfully', 'success');
            return result;
        } catch (error) {
            this.handleError('Failed to rebuild indexes', error);
            this.showToast('Index rebuild failed', 'error');
            throw error;
        }
    }

    /**
     * Cleanup orphaned records
     * @param {Object} _state - Component state object
     */
    async cleanupOrphaned(_state) {
        try {
            const result = await this.api.cleanupOrphaned();
            const message = `Cleanup completed. Removed ${result.orphaned_count || 0} orphaned records.`;
            this.showToast(message, 'success');
            return result;
        } catch (error) {
            this.handleError('Failed to cleanup orphaned records', error);
            this.showToast('Cleanup operation failed', 'error');
            throw error;
        }
    }

    /**
     * Validate database integrity
     * @param {Object} _state - Component state object
     */
    async validateDatabase(_state) {
        try {
            const result = await this.api.validateDatabase();
            
            if (result.valid) {
                this.showToast('Database validation passed', 'success');
            } else {
                this.showToast(`Database validation found ${result.issues.length} issues`, 'warning');
            }
            
            return result;
        } catch (error) {
            this.handleError('Failed to validate database', error);
            this.showToast('Database validation failed', 'error');
            throw error;
        }
    }

    /**
     * Get backup statistics
     * @param {Array} backups - Array of backup objects
     * @returns {Object} Backup statistics
     */
    getBackupStats(backups) {
        const now = new Date();
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        const stats = {
            total: backups.length,
            thisWeek: 0,
            thisMonth: 0,
            totalSize: 0,
            averageSize: 0,
            oldestBackup: null,
            newestBackup: null
        };

        backups.forEach(backup => {
            const backupDate = new Date(backup.created_at);
            
            if (backupDate >= oneWeekAgo) {
                stats.thisWeek++;
            }
            
            if (backupDate >= oneMonthAgo) {
                stats.thisMonth++;
            }
            
            stats.totalSize += backup.size || 0;
            
            if (!stats.oldestBackup || backupDate < new Date(stats.oldestBackup.created_at)) {
                stats.oldestBackup = backup;
            }
            
            if (!stats.newestBackup || backupDate > new Date(stats.newestBackup.created_at)) {
                stats.newestBackup = backup;
            }
        });

        stats.averageSize = stats.total > 0 ? stats.totalSize / stats.total : 0;

        return stats;
    }

    /**
     * Format file size for display
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Simulate progress for long-running operations
     * @param {Object} state - Component state object
     * @param {string} operation - Operation type ('backup' or 'restore')
     */
    simulateProgress(state, operation) {
        const progressKey = operation === 'backup' ? 'backupProgress' : 'restoreProgress';
        let progress = 0;
        
        const interval = setInterval(() => {
            progress += Math.random() * 20; // Random increment
            
            if (progress >= 95) {
                progress = 95; // Stop at 95%, let the actual operation complete
                clearInterval(interval);
            }
            
            state.backup[progressKey] = Math.min(progress, 95);
        }, 500);
    }

    /**
     * Confirm restore operation with user
     * @param {string} backupId - Backup ID
     * @returns {Promise<boolean>} User confirmation
     */
    async confirmRestore(backupId) {
        return new Promise((resolve) => {
            const message = `Are you sure you want to restore from backup ${backupId}? This will overwrite current data.`;
            
            if (window.confirm) {
                resolve(window.confirm(message));
            } else {
                // Fallback for environments without confirm
                resolve(true);
            }
        });
    }

    /**
     * Confirm backup deletion with user
     * @param {string} backupId - Backup ID
     * @returns {Promise<boolean>} User confirmation
     */
    async confirmDelete(backupId) {
        return new Promise((resolve) => {
            const message = `Are you sure you want to delete backup ${backupId}? This action cannot be undone.`;
            
            if (window.confirm) {
                resolve(window.confirm(message));
            } else {
                resolve(true);
            }
        });
    }

    /**
     * Handle errors consistently
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    handleError(message, error) {
        if (window.DevLogger && window.DevLogger.error) {
            window.DevLogger.error(message, error);
        }
    }
}

/**
 * Create a backup manager instance
 * @param {Object} api - API client instance
 * @param {Function} showToast - Toast notification function
 * @returns {SystemBackupManager} Backup manager instance
 */
function createBackupManager(api, showToast) {
    return new SystemBackupManager(api, showToast);
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SystemBackupManager, createBackupManager };
} else if (typeof window !== 'undefined') {
    window.SystemBackupManager = SystemBackupManager;
    window.createBackupManager = createBackupManager;
}
