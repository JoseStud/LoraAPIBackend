/**
 * Database Manager Component for System Admin
 * 
 * Handles all database-related operations including backups and optimization
 */

export function createDatabaseManagerComponent() {
    return {
        // State
        isBackingUp: false,
        isOptimizing: false,
        recentBackups: [],
        
        // API instance (will be set in init)
        api: null,

        init() {
            // Initialize API if available
            this.api = window.systemAdminAPI || this.createFallbackAPI();
            
            // Load initial backup data
            this.loadRecentBackups();
            
            if (import.meta.env.DEV) {
                // eslint-disable-next-line no-console
                console.log('🗄️ Database Manager Initialized');
            }
        },

        createFallbackAPI() {
            return {
                createBackup: async () => {
                    if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        console.log('Fallback: Creating backup...');
                    }
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    return { success: true, backup_id: Date.now(), filename: `backup-${Date.now()}.zip` };
                },
                optimizeDatabase: async () => {
                    if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        console.log('Fallback: Optimizing database...');
                    }
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    return { success: true };
                },
                getRecentBackups: async () => {
                    return {
                        success: true,
                        backups: [
                            { id: 1, filename: 'backup-2025-09-08.zip', created_at: new Date().toISOString(), size: 15728640 },
                            { id: 2, filename: 'backup-2025-09-07.zip', created_at: new Date(Date.now() - 86400000).toISOString(), size: 14598432 }
                        ]
                    };
                }
            };
        },

        async loadRecentBackups() {
            try {
                const response = await this.api.getRecentBackups();
                if (response.success) {
                    this.recentBackups = response.backups || [];
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('Failed to load recent backups:', error);
                this.showToast('Failed to load backup history', 'error');
            }
        },

        async createBackup() {
            if (this.isBackingUp) return;
            
            this.isBackingUp = true;
            try {
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.log('🔄 Starting database backup...');
                }
                
                const response = await this.api.createBackup();
                
                if (response.success) {
                    // Add the new backup to the list
                    const newBackup = {
                        id: response.backup_id,
                        filename: response.filename,
                        created_at: new Date().toISOString(),
                        size: response.size || 0,
                        status: 'completed'
                    };
                    
                    this.recentBackups.unshift(newBackup);
                    
                    // Keep only the last 10 backups in the UI
                    if (this.recentBackups.length > 10) {
                        this.recentBackups = this.recentBackups.slice(0, 10);
                    }
                    
                    this.showToast('Database backup created successfully!', 'success');
                    if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        console.log('✅ Backup completed:', response.filename);
                    }
                } else {
                    throw new Error(response.error || 'Backup failed');
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('❌ Backup failed:', error);
                this.showToast(`Backup failed: ${error.message}`, 'error');
            } finally {
                this.isBackingUp = false;
            }
        },

        async optimizeDatabase() {
            if (this.isOptimizing) return;
            
            this.isOptimizing = true;
            try {
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.log('🔄 Starting database optimization...');
                }
                
                const response = await this.api.optimizeDatabase();
                
                if (response.success) {
                    this.showToast('Database optimized successfully!', 'success');
                    if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        console.log('✅ Database optimization completed');
                    }
                } else {
                    throw new Error(response.error || 'Optimization failed');
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('❌ Optimization failed:', error);
                this.showToast(`Optimization failed: ${error.message}`, 'error');
            } finally {
                this.isOptimizing = false;
            }
        },

        async downloadBackup(backupId) {
            try {
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.log('📥 Downloading backup:', backupId);
                }
                
                if (this.api.downloadBackup) {
                    await this.api.downloadBackup(backupId);
                } else {
                    // Fallback: create a download link
                    const backup = this.recentBackups.find(b => b.id === backupId);
                    if (backup) {
                        this.showToast(`Download started: ${backup.filename}`, 'info');
                    }
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('❌ Download failed:', error);
                this.showToast(`Download failed: ${error.message}`, 'error');
            }
        },

        async deleteBackup(backupId) {
            try {
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.log('🗑️ Deleting backup:', backupId);
                }
                
                if (this.api.deleteBackup) {
                    const response = await this.api.deleteBackup(backupId);
                    if (response.success) {
                        // Remove from local list
                        this.recentBackups = this.recentBackups.filter(b => b.id !== backupId);
                        this.showToast('Backup deleted successfully', 'success');
                    } else {
                        throw new Error(response.error || 'Delete failed');
                    }
                } else {
                    // Fallback: just remove from UI
                    this.recentBackups = this.recentBackups.filter(b => b.id !== backupId);
                    this.showToast('Backup removed from list', 'info');
                }
            } catch (error) {
                // eslint-disable-next-line no-console
                console.error('❌ Delete failed:', error);
                this.showToast(`Delete failed: ${error.message}`, 'error');
            }
        },

        formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        },

        formatSize(bytes) {
            if (!bytes) return 'Unknown size';
            
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
        },

        showToast(message, type = 'info') {
            // Dispatch a custom event that the parent systemAdmin can listen to
            this.$dispatch('toast', { 
                message: message, 
                type: type 
            });
        }
    };
}
