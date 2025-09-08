/**
 * Generation Studio - Progress Tracking Module
 * 
 * Handles job progress updates, ETA calculations, and progress visualization.
 */

/**
 * Progress tracking for generation jobs
 */
const generationProgress = {
    /**
     * Updates job progress with validation
     */
    updateJobProgress(job, progressData) {
        if (!job || !progressData) {
            return null;
        }
        
        const validatedProgress = this.validateProgressData(progressData);
        const updatedJob = { ...job };
        
        // Update basic progress info
        updatedJob.progress = validatedProgress.progress;
        updatedJob.status = validatedProgress.status;
        updatedJob.current_step = validatedProgress.currentStep;
        updatedJob.total_steps = validatedProgress.totalSteps || job.total_steps;
        
        // Handle status-specific updates
        if (validatedProgress.status === 'processing') {
            updatedJob.start_time = updatedJob.start_time || Date.now();
            updatedJob.eta = this.calculateETA(updatedJob, validatedProgress.progress);
            updatedJob.speed = this.calculateGenerationSpeed(updatedJob);
        } else if (validatedProgress.status === 'completed') {
            updatedJob.progress = 100;
            updatedJob.end_time = Date.now();
            updatedJob.generation_time = this.calculateTotalTime(updatedJob);
            updatedJob.eta = null;
        } else if (validatedProgress.status === 'failed' || validatedProgress.status === 'cancelled') {
            updatedJob.end_time = Date.now();
            updatedJob.eta = null;
            updatedJob.error = validatedProgress.error;
        }
        
        // Update timestamp
        updatedJob.last_updated = Date.now();
        
        return updatedJob;
    },
    
    /**
     * Validates progress data
     */
    validateProgressData(data) {
        const validated = {
            progress: 0,
            status: 'unknown',
            currentStep: 0,
            totalSteps: null,
            error: null
        };
        
        // Validate progress percentage
        if (typeof data.progress === 'number') {
            validated.progress = Math.max(0, Math.min(100, data.progress));
        }
        
        // Validate status
        const validStatuses = ['queued', 'processing', 'completed', 'failed', 'cancelled', 'paused'];
        if (validStatuses.includes(data.status)) {
            validated.status = data.status;
        }
        
        // Validate current step
        if (typeof data.currentStep === 'number' && data.currentStep >= 0) {
            validated.currentStep = Math.floor(data.currentStep);
        } else if (typeof data.current_step === 'number' && data.current_step >= 0) {
            validated.currentStep = Math.floor(data.current_step);
        }
        
        // Validate total steps
        if (typeof data.totalSteps === 'number' && data.totalSteps > 0) {
            validated.totalSteps = Math.floor(data.totalSteps);
        } else if (typeof data.total_steps === 'number' && data.total_steps > 0) {
            validated.totalSteps = Math.floor(data.total_steps);
        }
        
        // Capture error message
        if (data.error) {
            validated.error = String(data.error);
        }
        
        return validated;
    },
    
    /**
     * Calculates estimated time remaining (ETA)
     */
    calculateETA(job, currentProgress) {
        if (!job.start_time || currentProgress <= 0) {
            return null;
        }
        
        const now = Date.now();
        const elapsed = (now - job.start_time) / 1000; // seconds
        
        if (elapsed < 5) {
            // Not enough data for reliable ETA
            return null;
        }
        
        const progressPercent = currentProgress / 100;
        const estimatedTotal = elapsed / progressPercent;
        const remaining = estimatedTotal - elapsed;
        
        return Math.max(0, remaining);
    },
    
    /**
     * Calculates generation speed (steps per second)
     */
    calculateGenerationSpeed(job) {
        if (!job.start_time || !job.current_step) {
            return 0;
        }
        
        const elapsed = (Date.now() - job.start_time) / 1000;
        if (elapsed <= 0) return 0;
        
        return job.current_step / elapsed;
    },
    
    /**
     * Calculates total generation time
     */
    calculateTotalTime(job) {
        if (!job.start_time) return 0;
        
        const endTime = job.end_time || Date.now();
        return (endTime - job.start_time) / 1000;
    },
    
    /**
     * Formats time duration for display
     */
    formatDuration(seconds) {
        if (!seconds || seconds <= 0) {
            return '—';
        }
        
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    },
    
    /**
     * Formats ETA for display
     */
    formatETA(etaSeconds) {
        if (!etaSeconds || etaSeconds <= 0) {
            return 'Unknown';
        }
        
        if (etaSeconds < 60) {
            return `~${Math.round(etaSeconds)}s`;
        } else if (etaSeconds < 3600) {
            const minutes = Math.ceil(etaSeconds / 60);
            return `~${minutes}m`;
        } else {
            const hours = Math.floor(etaSeconds / 3600);
            const minutes = Math.ceil((etaSeconds % 3600) / 60);
            return `~${hours}h ${minutes}m`;
        }
    },
    
    /**
     * Gets progress bar configuration
     */
    getProgressBarConfig(job) {
        if (!job) {
            return {
                progress: 0,
                status: 'unknown',
                color: 'gray',
                animated: false,
                text: ''
            };
        }
        
        const config = {
            progress: job.progress || 0,
            status: job.status || 'unknown',
            animated: false,
            text: ''
        };
        
        // Set color based on status
        switch (job.status) {
            case 'queued':
                config.color = 'blue';
                config.text = 'Queued';
                break;
            case 'processing':
                config.color = 'green';
                config.animated = true;
                config.text = this.getProcessingText(job);
                break;
            case 'completed':
                config.color = 'green';
                config.progress = 100;
                config.text = 'Completed';
                break;
            case 'failed':
                config.color = 'red';
                config.text = 'Failed';
                break;
            case 'cancelled':
                config.color = 'orange';
                config.text = 'Cancelled';
                break;
            case 'paused':
                config.color = 'yellow';
                config.text = 'Paused';
                break;
            default:
                config.color = 'gray';
                config.text = 'Unknown';
        }
        
        return config;
    },
    
    /**
     * Gets processing text with step info
     */
    getProcessingText(job) {
        const parts = [];
        
        if (job.current_step && job.total_steps) {
            parts.push(`Step ${job.current_step}/${job.total_steps}`);
        }
        
        if (job.progress) {
            parts.push(`${Math.round(job.progress)}%`);
        }
        
        if (job.eta) {
            parts.push(`ETA: ${this.formatETA(job.eta)}`);
        }
        
        return parts.length > 0 ? parts.join(' • ') : 'Processing...';
    },
    
    /**
     * Gets status icon for job
     */
    getStatusIcon(status) {
        const icons = {
            queued: '⏳',
            processing: '⚡',
            completed: '✅',
            failed: '❌',
            cancelled: '⏹️',
            paused: '⏸️'
        };
        
        return icons[status] || '❓';
    },
    
    /**
     * Gets status color class
     */
    getStatusColorClass(status) {
        const colorClasses = {
            queued: 'text-blue-600',
            processing: 'text-green-600',
            completed: 'text-green-600',
            failed: 'text-red-600',
            cancelled: 'text-orange-600',
            paused: 'text-yellow-600'
        };
        
        return colorClasses[status] || 'text-gray-600';
    },
    
    /**
     * Checks if job is active (not in final state)
     */
    isJobActive(job) {
        if (!job) return false;
        
        const activeStatuses = ['queued', 'processing', 'paused'];
        return activeStatuses.includes(job.status);
    },
    
    /**
     * Checks if job is completed
     */
    isJobCompleted(job) {
        return job && job.status === 'completed';
    },
    
    /**
     * Checks if job has failed
     */
    isJobFailed(job) {
        return job && (job.status === 'failed' || job.status === 'cancelled');
    },
    
    /**
     * Gets job priority score (for sorting)
     */
    getJobPriority(job) {
        if (!job) return 0;
        
        const statusPriority = {
            processing: 1000,
            queued: 500,
            paused: 100,
            failed: 10,
            cancelled: 5,
            completed: 1
        };
        
        const basePriority = statusPriority[job.status] || 0;
        const timePriority = job.created_at ? (Date.now() - new Date(job.created_at).getTime()) / 1000 : 0;
        
        return basePriority + (timePriority / 1000); // Newer jobs get slightly higher priority
    },
    
    /**
     * Sorts jobs by priority
     */
    sortJobsByPriority(jobs) {
        if (!Array.isArray(jobs)) return [];
        
        return [...jobs].sort((a, b) => {
            const priorityA = this.getJobPriority(a);
            const priorityB = this.getJobPriority(b);
            return priorityB - priorityA; // Higher priority first
        });
    },
    
    /**
     * Gets progress statistics for multiple jobs
     */
    getProgressStatistics(jobs) {
        if (!Array.isArray(jobs) || jobs.length === 0) {
            return {
                total: 0,
                queued: 0,
                processing: 0,
                completed: 0,
                failed: 0,
                cancelled: 0,
                paused: 0,
                averageProgress: 0,
                estimatedTotalTime: 0
            };
        }
        
        const stats = {
            total: jobs.length,
            queued: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            cancelled: 0,
            paused: 0,
            averageProgress: 0,
            estimatedTotalTime: 0
        };
        
        let totalProgress = 0;
        let totalETA = 0;
        
        jobs.forEach(job => {
            if (job.status) {
                stats[job.status] = (stats[job.status] || 0) + 1;
            }
            
            totalProgress += job.progress || 0;
            
            if (job.eta && this.isJobActive(job)) {
                totalETA += job.eta;
            }
        });
        
        stats.averageProgress = totalProgress / jobs.length;
        stats.estimatedTotalTime = totalETA;
        
        return stats;
    },
    
    /**
     * Creates progress event data
     */
    createProgressEvent(job, previousJob = null) {
        const event = {
            jobId: job.id,
            status: job.status,
            progress: job.progress,
            timestamp: Date.now(),
            changes: {}
        };
        
        if (previousJob) {
            // Track what changed
            if (previousJob.status !== job.status) {
                event.changes.status = { from: previousJob.status, to: job.status };
            }
            
            if (previousJob.progress !== job.progress) {
                event.changes.progress = { from: previousJob.progress, to: job.progress };
            }
            
            if (previousJob.current_step !== job.current_step) {
                event.changes.step = { from: previousJob.current_step, to: job.current_step };
            }
        }
        
        return event;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationProgress };
} else if (typeof window !== 'undefined') {
    window.generationProgress = generationProgress;
}
