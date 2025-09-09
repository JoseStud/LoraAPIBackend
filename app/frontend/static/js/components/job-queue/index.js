/**
 * Job Queue Component
 * 
 * Displays and manages active generation jobs.
 * Uses the global store for job data.
 */

export function createJobQueueComponent() {
    return {
        isInitialized: false,
        
        // Local UI state
        expanded: true,
        pollingInterval: null,
        isPolling: false, // ✅ Guard to prevent overlapping requests
        apiAvailable: true, // Flag to disable polling after 404
        
        init() {
            this.startPolling();
            this.isInitialized = true;
        },
        
        // Poll for job updates with robust guarding
        startPolling() {
            if (!this.apiAvailable) {
                console.log('[JobQueue] API not available, skipping polling setup');
                return;
            }
            
            if (this.pollingInterval) {
                console.log('[JobQueue] Polling already active, skipping setup');
                return;
            }
            
            console.log('[JobQueue] Starting job polling every 2 seconds');
            
            this.pollingInterval = setInterval(async () => {
                // ✅ Check the guard before running
                if (this.isPolling) {
                    console.log('[JobQueue] Polling in progress, skipping new request');
                    return;
                }
                
                if (!this.apiAvailable) {
                    clearInterval(this.pollingInterval);
                    this.pollingInterval = null;
                    console.log('[JobQueue] API unavailable, stopping polling');
                    return;
                }
                
                try {
                    this.isPolling = true; // ✅ Set the guard
                    await this.updateJobStatuses();
                } catch (error) {
                    console.error('[JobQueue] Job status update failed:', error);
                } finally {
                    this.isPolling = false; // ✅ Always release the guard
                }
            }, 2000);
        },
        
        // Update job statuses from API
        async updateJobStatuses() {
            try {
                const response = await fetch((window?.BACKEND_URL || '') + '/jobs/status');
                if (response.ok) {
                    const jobs = await response.json();
                    
                    // Update each job in the store
                    jobs.forEach(apiJob => {
                        const storeJob = this.$store.app.activeJobs.find(j => j.jobId === apiJob.id);
                        if (storeJob) {
                            this.$store.app.updateJob(storeJob.id, {
                                status: apiJob.status,
                                progress: apiJob.progress || 0,
                                message: apiJob.message
                            });
                            
                            // If job is complete, move to results
                            if (apiJob.status === 'completed' && apiJob.result) {
                                this.$store.app.addResult(apiJob.result);
                                this.$store.app.removeJob(storeJob.id);
                                this.$store.app.addNotification('Generation completed!', 'success');
                            } else if (apiJob.status === 'failed') {
                                this.$store.app.removeJob(storeJob.id);
                                this.$store.app.addNotification(`Generation failed: ${apiJob.error}`, 'error');
                            }
                        }
                    });
                } else if (response.status === 404) {
                    // API endpoint not implemented yet, stop polling
                    this.apiAvailable = false;
                    clearInterval(this.pollingInterval);
                    this.pollingInterval = null;
                }
            } catch (error) {
                // Silently handle polling errors
            }
        },
        
        // Cancel a job
        async cancelJob(jobId) {
            try {
                const job = this.$store.app.activeJobs.find(j => j.id === jobId);
                if (job && job.jobId) {
                    const response = await fetch((window?.BACKEND_URL || '') + `/jobs/${job.jobId}/cancel`, {
                        method: 'POST'
                    });
                    
                    if (response.ok) {
                        this.$store.app.removeJob(jobId);
                        this.$store.app.addNotification('Job cancelled', 'info');
                    }
                }
            } catch (error) {
                this.$store.app.addNotification('Failed to cancel job', 'error');
            }
        },
        
        // Clear completed jobs
        clearCompleted() {
            const completedJobs = this.$store.app.activeJobs.filter(job => 
                job.status === 'completed' || job.status === 'failed'
            );
            
            completedJobs.forEach(job => {
                this.$store.app.removeJob(job.id);
            });
        },
        
        // Format duration
        formatDuration(startTime) {
            const now = new Date();
            const start = new Date(startTime);
            const diffMs = now - start;
            const diffSecs = Math.floor(diffMs / 1000);
            
            if (diffSecs < 60) return `${diffSecs}s`;
            const diffMins = Math.floor(diffSecs / 60);
            if (diffMins < 60) return `${diffMins}m ${diffSecs % 60}s`;
            const diffHours = Math.floor(diffMins / 60);
            return `${diffHours}h ${diffMins % 60}m`;
        },
        
        // Get status color
        getStatusColor(status) {
            switch (status) {
                case 'running': return 'text-blue-600';
                case 'completed': return 'text-green-600';
                case 'failed': return 'text-red-600';
                case 'cancelled': return 'text-gray-600';
                default: return 'text-yellow-600';
            }
        },
        
        // Computed properties
        get jobs() {
            return this.$store.app.activeJobs;
        },
        
        get hasJobs() {
            return this.jobs.length > 0;
        },
        
        get runningJobs() {
            return this.jobs.filter(job => job.status === 'running' || job.status === 'starting');
        },
        
        // ✅ Cleanup intervals and resources on component destruction
        destroy() {
            console.log('[JobQueue] Component destroying, cleaning up resources');
            
            // ✅ Stop polling interval
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
                console.log('[JobQueue] Polling interval cleared');
            }
            
            // ✅ Reset polling state
            this.isPolling = false;
            
            console.log('[JobQueue] Component cleanup completed');
        }
    };
}
