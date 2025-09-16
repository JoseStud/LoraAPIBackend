<template>
  <div v-if="isReady" class="card" :class="cardClass">
    <div class="card-header">
      <div class="flex items-center justify-between">
        <h3 class="card-title">{{ title }}</h3>
        <div class="flex items-center space-x-2">
          <span v-if="showJobCount" class="text-sm text-gray-500">{{ jobCountLabel }}</span>
          <button 
            v-if="showClearCompleted && hasJobs"
            @click="handleClearCompleted"
            class="btn btn-outline btn-sm"
            type="button"
          >
            Clear Completed
          </button>
        </div>
      </div>
    </div>
    <div class="card-body">
      <!-- Active Jobs -->
      <div class="space-y-3 max-h-96 overflow-y-auto">
        <template v-for="job in jobs" :key="job.id">
          <div class="border border-gray-200 rounded-lg p-3">
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900 truncate">
                  {{ job.name || job.prompt }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ getJobDetailsText(job) }}
                </div>
              </div>
              <button 
                v-if="canCancelJob(job)"
                @click="handleCancelJob(job.id)" 
                class="text-gray-400 hover:text-red-500 ml-2"
                type="button"
                :disabled="isCancelling"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            
            <!-- Progress Bar -->
            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span :class="getStatusColorClass(job.status)">{{ job.status }}</span>
                <span class="text-gray-600">{{ job.progress || 0 }}%</span>
              </div>
              <div class="progress-bar-bg">
                <div 
                  class="progress-bar-fg bg-blue-500" 
                  :style="{ width: `${job.progress || 0}%` }"
                ></div>
              </div>
              <div class="flex justify-between text-xs text-gray-500">
                <span>{{ formatDuration(job.startTime) }}</span>
                <span>{{ job.message || '' }}</span>
              </div>
            </div>
          </div>
        </template>
        
        <!-- Empty State -->
        <div v-if="!hasJobs" class="empty-state-container">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
          </svg>
          <div class="empty-state-title">{{ emptyStateTitle }}</div>
          <div class="empty-state-message">{{ emptyStateMessage }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useApi } from './composables/useApi.js';

export default {
  name: 'JobQueue',
  props: {
    title: {
      type: String,
      default: 'Generation Queue'
    },
    emptyStateTitle: {
      type: String,
      default: 'No active generations'
    },
    emptyStateMessage: {
      type: String,
      default: 'Start a generation to see progress here'
    },
    cardClass: {
      type: String,
      default: ''
    },
    pollingInterval: {
      type: Number,
      default: 2000
    },
    disabled: {
      type: Boolean,
      default: false
    },
    showJobCount: {
      type: Boolean,
      default: true
    },
    showClearCompleted: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    // Reactive state
    const isReady = ref(false);
    const isPolling = ref(false);
    const apiAvailable = ref(true);
    const isCancelling = ref(false);
    const pollingTimer = ref(null);

    // Access to global Alpine store - this maintains compatibility
    const store = window.Alpine?.store('app');
    
    // Job data - computed from the Alpine store for compatibility
    const jobs = computed(() => store?.activeJobs || []);
    const hasJobs = computed(() => jobs.value.length > 0);
    const jobCountLabel = computed(() => `${jobs.value.length} active`);

    // Utility functions
    const formatDuration = (startTime) => {
      const now = new Date();
      const start = new Date(startTime);
      const diffMs = now - start;
      const diffSecs = Math.floor(diffMs / 1000);
      
      if (diffSecs < 60) return `${diffSecs}s`;
      const diffMins = Math.floor(diffSecs / 60);
      if (diffMins < 60) return `${diffMins}m ${diffSecs % 60}s`;
      const diffHours = Math.floor(diffMins / 60);
      return `${diffHours}h ${diffMins % 60}m`;
    };

    const getStatusColorClass = (status) => {
      switch (status) {
        case 'running': return 'text-blue-600';
        case 'completed': return 'text-green-600';
        case 'failed': return 'text-red-600';
        case 'cancelled': return 'text-gray-600';
        default: return 'text-yellow-600';
      }
    };

    const getJobDetailsText = (job) => {
      if (job.params) {
        return `${job.params.width}x${job.params.height} • ${job.params.steps} steps`;
      }
      return 'Processing...';
    };

    const canCancelJob = (job) => {
      return job.status === 'running' || job.status === 'starting';
    };

    // Job management functions
    const handleClearCompleted = () => {
      if (!store) return;

      const completedJobs = store.activeJobs.filter(job => 
        job.status === 'completed' || job.status === 'failed'
      );
      
      completedJobs.forEach(job => {
        store.removeJob(job.id);
      });
    };

    const updateJobStatuses = async () => {
      if (!apiAvailable.value || !store) return;

      try {
        const backendUrl = window?.BACKEND_URL || '';
        const response = await fetch(`${backendUrl}/jobs/status`);
        
        if (response.ok) {
          const apiJobs = await response.json();
          
          // Update each job in the store
          apiJobs.forEach(apiJob => {
            const storeJob = store.activeJobs.find(j => j.jobId === apiJob.id);
            if (storeJob) {
              store.updateJob(storeJob.id, {
                status: apiJob.status,
                progress: apiJob.progress || 0,
                message: apiJob.message
              });
              
              // If job is complete, move to results
              if (apiJob.status === 'completed' && apiJob.result) {
                store.addResult(apiJob.result);
                store.removeJob(storeJob.id);
                store.addNotification('Generation completed!', 'success');
              } else if (apiJob.status === 'failed') {
                store.removeJob(storeJob.id);
                store.addNotification(`Generation failed: ${apiJob.error}`, 'error');
              }
            }
          });
        } else if (response.status === 404) {
          // API endpoint not implemented yet, stop polling
          apiAvailable.value = false;
          stopPolling();
        }
      } catch (error) {
        // Silently handle polling errors (like the Alpine version)
        console.debug('[JobQueue] Polling error:', error);
      }
    };

    const handleCancelJob = async (jobId) => {
      if (!store || isCancelling.value) return;

      try {
        isCancelling.value = true;
        const job = store.activeJobs.find(j => j.id === jobId);
        
        if (job && job.jobId) {
          const backendUrl = window?.BACKEND_URL || '';
          const response = await fetch(`${backendUrl}/jobs/${job.jobId}/cancel`, {
            method: 'POST'
          });
          
          if (response.ok) {
            store.removeJob(jobId);
            store.addNotification('Job cancelled', 'info');
          } else {
            store.addNotification('Failed to cancel job', 'error');
          }
        }
      } catch (error) {
        store.addNotification('Failed to cancel job', 'error');
      } finally {
        isCancelling.value = false;
      }
    };

    // Polling management
    const startPolling = () => {
      if (!apiAvailable.value || pollingTimer.value || props.disabled) {
        return;
      }

      console.log('[JobQueue] Starting job polling every', props.pollingInterval, 'ms');
      
      pollingTimer.value = setInterval(async () => {
        if (isPolling.value) {
          console.debug('[JobQueue] Polling in progress, skipping new request');
          return;
        }
        
        if (!apiAvailable.value) {
          stopPolling();
          return;
        }
        
        try {
          isPolling.value = true;
          await updateJobStatuses();
        } catch (error) {
          console.error('[JobQueue] Job status update failed:', error);
        } finally {
          isPolling.value = false;
        }
      }, props.pollingInterval);
    };

    const stopPolling = () => {
      if (pollingTimer.value) {
        clearInterval(pollingTimer.value);
        pollingTimer.value = null;
        console.log('[JobQueue] Polling stopped');
      }
      isPolling.value = false;
    };

    // Lifecycle
    onMounted(() => {
      console.log('[JobQueue] Vue component mounted');
      isReady.value = true;
      
      if (!props.disabled) {
        startPolling();
      }
    });

    onUnmounted(() => {
      console.log('[JobQueue] Vue component unmounting, cleaning up');
      stopPolling();
    });

    return {
      isReady,
      jobs,
      hasJobs,
      jobCountLabel,
      isCancelling,
      formatDuration,
      getStatusColorClass,
      getJobDetailsText,
      canCancelJob,
      handleCancelJob,
      handleClearCompleted
    };
  }
};
</script>