<template>
  <div class="generation-studio-container">
    <!-- Generation Parameters Panel -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Generation Parameters</h3>
      </div>
      <div class="card-body space-y-6">
        
        <!-- Prompt Input -->
        <div>
          <label class="form-label">Prompt</label>
          <textarea 
            v-model="params.prompt" 
            placeholder="Enter your prompt..."
            class="form-input h-24 resize-none"
          ></textarea>
        </div>
        
        <!-- Negative Prompt -->
        <div>
          <label class="form-label">Negative Prompt</label>
          <textarea 
            v-model="params.negative_prompt" 
            placeholder="Enter negative prompt..."
            class="form-input h-16 resize-none"
          ></textarea>
        </div>
        
        <!-- Image Dimensions -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Width</label>
            <select v-model="params.width" class="form-input">
              <option value="512">512px</option>
              <option value="768">768px</option>
              <option value="1024">1024px</option>
            </select>
          </div>
          <div>
            <label class="form-label">Height</label>
            <select v-model="params.height" class="form-input">
              <option value="512">512px</option>
              <option value="768">768px</option>
              <option value="1024">1024px</option>
            </select>
          </div>
        </div>
        
        <!-- Advanced Parameters -->
        <div class="space-y-4">
          <div>
            <label class="form-label">
              Steps: <span class="font-semibold">{{ params.steps }}</span>
            </label>
            <input 
              type="range" 
              v-model="params.steps" 
              min="10" 
              max="100" 
              step="5" 
              class="weight-slider-input"
            />
            <div class="slider-labels">
              <span>10</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
          
          <div>
            <label class="form-label">
              CFG Scale: <span class="font-semibold">{{ params.cfg_scale }}</span>
            </label>
            <input 
              type="range" 
              v-model="params.cfg_scale" 
              min="1" 
              max="20" 
              step="0.5" 
              class="weight-slider-input"
            />
            <div class="slider-labels">
              <span>1</span>
              <span>7</span>
              <span>20</span>
            </div>
          </div>
          
          <div>
            <label class="form-label">Seed</label>
            <div class="flex space-x-2">
              <input 
                type="number" 
                v-model="params.seed" 
                placeholder="-1 for random"
                class="form-input flex-1"
              />
              <button 
                @click="params.seed = -1" 
                class="btn btn-secondary btn-sm"
              >
                Random
              </button>
            </div>
          </div>
        </div>
        
        <!-- Batch Settings -->
        <div class="border-t pt-4">
          <h4 class="font-medium text-gray-900 mb-3">Batch Settings</h4>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="form-label">Batch Count</label>
              <input 
                type="number" 
                v-model="params.batch_count" 
                min="1" 
                max="10" 
                class="form-input"
              />
            </div>
            <div>
              <label class="form-label">Batch Size</label>
              <input 
                type="number" 
                v-model="params.batch_size" 
                min="1" 
                max="4" 
                class="form-input"
              />
            </div>
          </div>
        </div>
        
        <!-- Generate Button -->
        <button 
          @click="startGeneration" 
          class="btn btn-primary w-full"
          :disabled="!canGenerate"
        >
          <div v-if="!isGenerating" class="flex items-center justify-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            Generate Image
          </div>
          <div v-else class="flex items-center justify-center">
            <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
            </svg>
            Generating...
          </div>
        </button>
        
        <!-- Quick Actions -->
        <div class="border-t pt-4">
          <h4 class="font-medium text-gray-900 mb-3">Quick Actions</h4>
          <div class="space-y-2">
            <button 
              @click="loadFromComposer" 
              class="btn btn-secondary btn-sm w-full"
            >
              Load from Composer
            </button>
            <button 
              @click="useRandomPrompt" 
              class="btn btn-secondary btn-sm w-full"
            >
              Random Prompt
            </button>
            <button 
              @click="savePreset" 
              class="btn btn-secondary btn-sm w-full"
            >
              Save Preset
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Generation Queue Panel -->
    <div class="card">
      <div class="card-header">
        <div class="flex items-center justify-between">
          <h3 class="card-title">Generation Queue</h3>
          <span class="text-sm text-gray-500">{{ activeJobs.length }} active</span>
        </div>
      </div>
      <div class="card-body">
        
        <!-- Active Jobs -->
        <div class="space-y-3 max-h-96 overflow-y-auto">
          <div 
            v-for="job in activeJobs" 
            :key="job.id" 
            class="border border-gray-200 rounded-lg p-3"
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium text-gray-900 truncate">
                  {{ job.name || job.prompt }}
                </div>
                <div class="text-xs text-gray-500">
                  {{ job.params ? `${job.params.width}x${job.params.height} • ${job.params.steps} steps` : 'Processing...' }}
                </div>
              </div>
              <button 
                v-if="job.status === 'running' || job.status === 'starting'"
                @click="cancelJob(job.id)" 
                class="text-gray-400 hover:text-red-500 ml-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
            
            <!-- Progress Bar -->
            <div class="space-y-1">
              <div class="flex justify-between text-xs">
                <span :class="getStatusColor(job.status)">{{ job.status }}</span>
                <span class="text-gray-600">{{ job.progress || 0 }}%</span>
              </div>
              <div class="progress-bar-bg">
                <div 
                  class="progress-bar-fg bg-blue-500" 
                  :style="`width: ${job.progress || 0}%`"
                ></div>
              </div>
              <div class="flex justify-between text-xs text-gray-500">
                <span>{{ formatDuration(job.startTime) }}</span>
                <span>{{ job.message || '' }}</span>
              </div>
            </div>
          </div>
          
          <!-- Empty State -->
          <div v-if="!hasActiveJobs" class="empty-state-container">
            <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"></path>
            </svg>
            <div class="empty-state-title">No active generations</div>
            <div class="empty-state-message">Start a generation to see progress here</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recent Results Panel -->
    <div class="card h-full">
      <div class="card-header">
        <div class="flex items-center justify-between">
          <h3 class="card-title">{{ showHistory ? 'Generation History' : 'Recent Results' }}</h3>
          <button 
            @click="refreshResults" 
            class="text-gray-400 hover:text-gray-600"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
          </button>
        </div>
      </div>
      <div class="card-body">
        
        <!-- Results Gallery -->
        <div class="space-y-4 max-h-96 overflow-y-auto">
          <div 
            v-for="result in recentResults" 
            :key="result.id" 
            class="border border-gray-200 rounded-lg overflow-hidden"
          >
            <!-- Image Thumbnail -->
            <img 
              v-if="result.image_url" 
              :src="result.image_url" 
              :alt="result.prompt"
              class="w-full h-32 object-cover cursor-pointer"
              @click="showImageModal(result)"
            />
            
            <!-- Result Info -->
            <div class="p-3">
              <div class="text-sm text-gray-900 mb-1 line-clamp-2">
                {{ result.prompt }}
              </div>
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span>{{ result.created_at }}</span>
                <div class="flex space-x-2">
                  <button 
                    @click="reuseParameters(result)" 
                    class="text-blue-500 hover:text-blue-700"
                  >
                    Reuse
                  </button>
                  <button 
                    @click="deleteResult(result.id)" 
                    class="text-red-500 hover:text-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Empty State -->
          <div v-if="!hasRecentResults" class="empty-state-container">
            <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <div class="empty-state-title">No results yet</div>
            <div class="empty-state-message">Generated images will appear here</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Image Modal -->
    <div 
      v-if="showModal" 
      class="fixed inset-0 z-50 overflow-y-auto"
      @click="hideImageModal"
    >
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75"></div>
        
        <div 
          class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
          @click.stop
        >
          <div v-if="selectedResult">
            <img 
              :src="selectedResult.image_url" 
              :alt="selectedResult.prompt"
              class="w-full"
            />
            <div class="p-4">
              <h3 class="text-lg font-medium text-gray-900 mb-2">Generation Details</h3>
              <div class="space-y-1 text-sm text-gray-600">
                <div><strong>Prompt:</strong> {{ selectedResult.prompt }}</div>
                <div><strong>Size:</strong> {{ selectedResult.width }}x{{ selectedResult.height }}</div>
                <div><strong>Steps:</strong> {{ selectedResult.steps }}</div>
                <div><strong>CFG Scale:</strong> {{ selectedResult.cfg_scale }}</div>
                <div><strong>Seed:</strong> {{ selectedResult.seed }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue';
import { useApi } from './composables/useApi.js';

// Reactive state
const params = reactive({
  prompt: '',
  negative_prompt: '',
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7.0,
  seed: -1,
  batch_count: 1,
  batch_size: 1
});

const activeJobs = ref([]);
const recentResults = ref([]);
const systemStatus = ref({});
const isGenerating = ref(false);
const showHistory = ref(false);
const showModal = ref(false);
const selectedResult = ref(null);
const websocket = ref(null);
const pollInterval = ref(null);

// Computed properties
const canGenerate = computed(() => !isGenerating.value && params.prompt.trim().length > 0);
const hasActiveJobs = computed(() => activeJobs.value.length > 0);
const hasRecentResults = computed(() => recentResults.value.length > 0);

// API helpers using useApi composable
const getBackendUrl = () => (window?.BACKEND_URL || '');

// Generation methods
const startGeneration = async () => {
  if (!params.prompt.trim()) {
    showNotification('Please enter a prompt', 'error');
    return;
  }
  
  isGenerating.value = true;
  
  try {
    const response = await fetch(`${getBackendUrl()}/generation/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    });
    
    if (response.ok) {
      const result = await response.json();
      
      if (result.job_id) {
        // Add job to active jobs list
        const newJob = {
          id: result.job_id,
          prompt: params.prompt,
          width: params.width,
          height: params.height,
          steps: params.steps,
          status: 'queued',
          progress: 0,
          current_step: 0,
          total_steps: params.steps,
          created_at: new Date().toISOString()
        };
        
        activeJobs.value.unshift(newJob);
        showNotification('Generation started successfully', 'success');
      }
    } else {
      const error = await response.text();
      console.error('Generation failed:', error);
      showNotification('Generation failed', 'error');
    }
  } catch (error) {
    console.error('Error starting generation:', error);
    showNotification('Error starting generation', 'error');
  } finally {
    isGenerating.value = false;
  }
};

const cancelJob = async (jobId) => {
  try {
    const response = await fetch(`${getBackendUrl()}/generation/jobs/${jobId}/cancel`, {
      method: 'POST'
    });
    
    if (response.ok) {
      activeJobs.value = activeJobs.value.filter(job => job.id !== jobId);
      showNotification('Generation cancelled', 'success');
    } else {
      showNotification('Failed to cancel generation', 'error');
    }
  } catch (error) {
    console.error('Error cancelling job:', error);
    showNotification('Error cancelling generation', 'error');
  }
};

// Result management
const showImageModal = (result) => {
  selectedResult.value = result;
  showModal.value = true;
};

const hideImageModal = () => {
  showModal.value = false;
  selectedResult.value = null;
};

const reuseParameters = (result) => {
  params.prompt = result.prompt;
  params.negative_prompt = result.negative_prompt || '';
  params.width = result.width;
  params.height = result.height;
  params.steps = result.steps;
  params.cfg_scale = result.cfg_scale;
  params.seed = result.seed;
  
  showNotification('Parameters loaded from result', 'success');
};

const deleteResult = async (resultId) => {
  if (!confirm('Are you sure you want to delete this result?')) return;
  
  try {
    const response = await fetch(`${getBackendUrl()}/generation/results/${resultId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      recentResults.value = recentResults.value.filter(r => r.id !== resultId);
      showNotification('Result deleted', 'success');
    } else {
      showNotification('Failed to delete result', 'error');
    }
  } catch (error) {
    console.error('Error deleting result:', error);
    showNotification('Error deleting result', 'error');
  }
};

const refreshResults = async () => {
  await loadRecentResults();
  showNotification('Results refreshed', 'success');
};

// Quick actions
const loadFromComposer = () => {
  const composerData = localStorage.getItem('composerPrompt');
  if (composerData) {
    params.prompt = composerData;
    showNotification('Loaded prompt from composer', 'success');
  } else {
    showNotification('No composer data found', 'warning');
  }
};

const useRandomPrompt = () => {
  const randomPrompts = [
    'a beautiful anime girl with long flowing hair',
    'a majestic dragon soaring through cloudy skies',
    'a cyberpunk cityscape with neon lights',
    'a serene landscape with mountains and a lake',
    'a cute robot in a futuristic laboratory',
    'a magical forest with glowing mushrooms',
    'a space station orbiting a distant planet',
    'a steampunk airship flying over Victorian city'
  ];
  
  params.prompt = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
  showNotification('Random prompt generated', 'success');
};

const savePreset = () => {
  const presetName = prompt('Enter a name for this preset:');
  if (!presetName) return;
  
  const preset = {
    name: presetName,
    params: { ...params },
    created_at: new Date().toISOString()
  };
  
  try {
    const savedPresets = JSON.parse(localStorage.getItem('generationPresets') || '[]');
    savedPresets.push(preset);
    localStorage.setItem('generationPresets', JSON.stringify(savedPresets));
    
    showNotification(`Preset "${presetName}" saved`, 'success');
  } catch (error) {
    console.error('Failed to save preset:', error);
    showNotification('Failed to save preset', 'error');
  }
};

// Data loading methods
const loadSystemStatus = async () => {
  try {
    const response = await fetch(`${getBackendUrl()}/system/status`);
    if (response.ok) {
      systemStatus.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to load system status:', error);
  }
};

const loadActiveJobs = async () => {
  try {
    const response = await fetch(`${getBackendUrl()}/generation/jobs/active`);
    if (response.ok) {
      activeJobs.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to load active jobs:', error);
  }
};

const loadRecentResults = async () => {
  try {
    const limit = showHistory.value ? 50 : 10;
    const response = await fetch(`${getBackendUrl()}/generation/results?limit=${limit}`);
    if (response.ok) {
      recentResults.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to load recent results:', error);
  }
};

// WebSocket management
const initWebSocket = () => {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/generation`;
    
    websocket.value = new WebSocket(wsUrl);
    
    websocket.value.onopen = () => {
      console.log('WebSocket connected for generation updates');
    };
    
    websocket.value.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };
    
    websocket.value.onclose = () => {
      console.log('WebSocket disconnected, falling back to polling');
      // Reconnect after 5 seconds
      setTimeout(() => initWebSocket(), 5000);
    };
    
    websocket.value.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  } catch (error) {
    console.error('Failed to initialize WebSocket:', error);
  }
};

const handleWebSocketMessage = (data) => {
  switch (data.type) {
    case 'generation_progress':
      updateJobProgress(data.job_id, data.progress, data.status);
      break;
    case 'generation_complete':
      handleGenerationComplete(data);
      break;
    case 'generation_error':
      handleGenerationError(data);
      break;
    case 'queue_update':
      activeJobs.value = data.jobs;
      break;
  }
};

const updateJobProgress = (jobId, progress, status) => {
  const job = activeJobs.value.find(j => j.id === jobId);
  if (job) {
    job.progress = progress;
    job.status = status;
  }
};

const handleGenerationComplete = (data) => {
  // Remove from active jobs
  activeJobs.value = activeJobs.value.filter(job => job.id !== data.job_id);
  
  // Add to recent results
  recentResults.value.unshift({
    id: data.result_id,
    job_id: data.job_id,
    prompt: data.prompt,
    image_url: data.image_url,
    width: data.width,
    height: data.height,
    steps: data.steps,
    cfg_scale: data.cfg_scale,
    seed: data.seed,
    created_at: new Date().toLocaleString()
  });
  
  showNotification('Generation completed successfully', 'success');
};

const handleGenerationError = (data) => {
  // Remove from active jobs
  activeJobs.value = activeJobs.value.filter(job => job.id !== data.job_id);
  
  showNotification(`Generation failed: ${data.error}`, 'error');
};

// Polling setup
const startPolling = () => {
  pollInterval.value = setInterval(async () => {
    if (activeJobs.value.length > 0) {
      await loadActiveJobs();
    }
    await loadSystemStatus();
  }, 2000);
};

const stopPolling = () => {
  if (pollInterval.value) {
    clearInterval(pollInterval.value);
    pollInterval.value = null;
  }
};

// Utility methods
const getStatusColor = (status) => {
  switch (status) {
    case 'running':
      return 'text-blue-600';
    case 'completed':
      return 'text-green-600';
    case 'failed':
      return 'text-red-600';
    case 'queued':
      return 'text-yellow-600';
    default:
      return 'text-gray-600';
  }
};

const formatDuration = (startTime) => {
  if (!startTime) return '';
  
  const start = new Date(startTime);
  const now = new Date();
  const diff = Math.floor((now - start) / 1000);
  
  if (diff < 60) {
    return `${diff}s`;
  } else if (diff < 3600) {
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    return `${minutes}m ${seconds}s`;
  } else {
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
};

// Notification system (integrates with Alpine store)
const showNotification = (message, type = 'success') => {
  // Update Alpine store for compatibility with existing notifications
  if (window.Alpine && window.Alpine.store('app')) {
    window.Alpine.store('app').addNotification(message, type);
  } else {
    // Fallback for standalone usage
    console.log(`[${type.toUpperCase()}] ${message}`);
  }
};

// Lifecycle
onMounted(async () => {
  console.log('Generation Studio Vue component mounted');
  
  // Load initial data
  await Promise.all([
    loadSystemStatus(),
    loadActiveJobs(),
    loadRecentResults()
  ]);
  
  // Initialize WebSocket connection
  initWebSocket();
  
  // Start polling as fallback
  startPolling();
  
  // Load parameters from URL if available
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.has('prompt')) {
    params.prompt = urlParams.get('prompt');
  }
});

onUnmounted(() => {
  // Cleanup
  stopPolling();
  if (websocket.value) {
    websocket.value.close();
  }
});
</script>

<style scoped>
.generation-studio-container {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1.5rem;
  padding: 1rem;
}

@media (max-width: 1024px) {
  .generation-studio-container {
    grid-template-columns: 1fr;
  }
}

.progress-bar-bg {
  width: 100%;
  height: 4px;
  background-color: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
}

.progress-bar-fg {
  height: 100%;
  transition: width 0.3s ease;
}

.slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 0.25rem;
}

.empty-state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
}

.empty-state-icon {
  width: 3rem;
  height: 3rem;
  color: #9ca3af;
  margin-bottom: 1rem;
}

.empty-state-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #4b5563;
  margin-bottom: 0.5rem;
}

.empty-state-message {
  font-size: 0.75rem;
  color: #6b7280;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>