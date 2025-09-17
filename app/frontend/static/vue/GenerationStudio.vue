<template>
  <div class="generation-page-container">
    <!-- Page Header -->
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">Generation Studio</h1>
          <p class="page-subtitle">Generate images with AI-powered LoRA integration</p>
        </div>
        <div class="header-actions flex gap-2">
          <button 
            @click="showHistory = !showHistory" 
            class="btn btn-secondary btn-sm"
            :class="{ 'btn-primary': showHistory }"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            History
          </button>
          <button 
            @click="clearQueue" 
            class="btn btn-secondary btn-sm"
            :disabled="activeJobs.length === 0"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
            Clear Queue
          </button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <!-- Left Panel: Generation Parameters -->
      <div class="lg:col-span-1">
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
                  v-model.number="params.steps" 
                  min="10" 
                  max="100" 
                  step="5" 
                  class="weight-slider-input"
                >
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
                  v-model.number="params.cfg_scale" 
                  min="1" 
                  max="20" 
                  step="0.5" 
                  class="weight-slider-input"
                >
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
                    v-model.number="params.seed" 
                    placeholder="-1 for random"
                    class="form-input flex-1"
                  >
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
                    v-model.number="params.batch_count" 
                    min="1" 
                    max="10" 
                    class="form-input"
                  >
                </div>
                <div>
                  <label class="form-label">Batch Size</label>
                  <input 
                    type="number" 
                    v-model.number="params.batch_size" 
                    min="1" 
                    max="4" 
                    class="form-input"
                  >
                </div>
              </div>
            </div>
            
            <!-- Generate Button -->
            <button 
              @click="startGeneration" 
              class="btn btn-primary w-full"
              :disabled="!params.prompt.trim() || isGenerating"
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
      </div>

      <!-- Center Panel: Generation Queue & Progress -->
      <div class="lg:col-span-1">
        <div class="space-y-6">
          
          <!-- Active Jobs Queue -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Active Jobs</h3>
            </div>
            <div class="card-body">
              <div v-if="activeJobs.length === 0" class="empty-state-container">
                <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
                <div class="empty-state-title">No active jobs</div>
                <div class="empty-state-message">Generation queue is empty</div>
              </div>
              
              <div v-else class="space-y-3">
                <div 
                  v-for="job in sortedActiveJobs" 
                  :key="job.id" 
                  class="border border-gray-200 rounded-lg p-3"
                >
                  <!-- Job Header -->
                  <div class="flex items-center justify-between mb-2">
                    <div class="text-sm font-medium text-gray-900 truncate">
                      {{ job.prompt || 'Untitled Generation' }}
                    </div>
                    <div class="flex items-center space-x-2">
                      <span 
                        class="px-2 py-1 text-xs rounded-full"
                        :class="getJobStatusClasses(job.status)"
                      >
                        {{ getJobStatusText(job.status) }}
                      </span>
                      <button 
                        v-if="canCancelJob(job)"
                        @click="cancelJob(job.id)"
                        class="text-red-500 hover:text-red-700 text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  
                  <!-- Progress Bar -->
                  <div v-if="job.status === 'processing'" class="mb-2">
                    <div class="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Step {{ job.current_step || 0 }} of {{ job.total_steps || job.steps }}</span>
                      <span>{{ Math.round(job.progress || 0) }}%</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        class="bg-blue-600 h-2 rounded-full transition-all duration-500"
                        :style="{ width: `${job.progress || 0}%` }"
                      ></div>
                    </div>
                  </div>
                  
                  <!-- Job Details -->
                  <div class="flex justify-between text-xs text-gray-500">
                    <span>{{ job.width }}×{{ job.height }} • {{ job.steps }} steps</span>
                    <span>{{ formatTime(job.created_at) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- System Status Card -->
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">System Status</h3>
            </div>
            <div class="card-body">
              <div class="space-y-3">
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600">Status:</span>
                  <span 
                    class="text-sm font-medium"
                    :class="getSystemStatusClasses(systemStatus.status)"
                  >
                    {{ systemStatus.status || 'Unknown' }}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600">Queue:</span>
                  <span class="text-sm font-medium">{{ systemStatus.queue_length || 0 }} jobs</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-sm text-gray-600">Workers:</span>
                  <span class="text-sm font-medium">{{ systemStatus.active_workers || 0 }} active</span>
                </div>
                <div v-if="systemStatus.gpu_status" class="flex justify-between">
                  <span class="text-sm text-gray-600">GPU:</span>
                  <span class="text-sm font-medium">{{ systemStatus.gpu_status }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Panel: Recent Results -->
      <div class="lg:col-span-1">
        <div class="card h-full">
          <div class="card-header">
            <div class="flex items-center justify-between">
              <h3 class="card-title">
                {{ showHistory ? 'Generation History' : 'Recent Results' }}
              </h3>
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
                >
                
                <!-- Result Info -->
                <div class="p-3">
                  <div class="text-sm text-gray-900 mb-1 line-clamp-2">
                    {{ result.prompt }}
                  </div>
                  <div class="flex items-center justify-between text-xs text-gray-500">
                    <span>{{ formatTime(result.created_at) }}</span>
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
              <div v-if="recentResults.length === 0" class="empty-state-container">
                <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                </svg>
                <div class="empty-state-title">No results yet</div>
                <div class="empty-state-message">Generated images will appear here</div>
              </div>
            </div>
          </div>
          
          <!-- Image Modal -->
          <div 
            v-if="showModal && selectedResult" 
            class="fixed inset-0 z-50 overflow-y-auto"
            @click.self="hideImageModal"
          >
            <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
              <div class="fixed inset-0 bg-gray-500 bg-opacity-75" @click="hideImageModal"></div>
              
              <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
                <img 
                  :src="selectedResult.image_url" 
                  :alt="selectedResult.prompt"
                  class="w-full"
                >
                <div class="p-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-2">Generation Details</h3>
                  <div class="space-y-1 text-sm text-gray-600">
                    <div><strong>Prompt:</strong> {{ selectedResult.prompt }}</div>
                    <div><strong>Size:</strong> {{ selectedResult.width }}×{{ selectedResult.height }}</div>
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
    
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useApi } from './composables/useApi.js'

// Reactive state
const params = ref({
  prompt: '',
  negative_prompt: '',
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7.0,
  seed: -1,
  batch_count: 1,
  batch_size: 1
})

const activeJobs = ref([])
const recentResults = ref([])
const systemStatus = ref({})
const isGenerating = ref(false)
const showHistory = ref(false)
const showModal = ref(false)
const selectedResult = ref(null)

// WebSocket and polling
const websocket = ref(null)
const pollInterval = ref(null)
const isConnected = ref(false)

// API composables
const { fetchData: loadSystemStatus } = useApi('/api/system/status')
const { fetchData: loadActiveJobsData } = useApi('/api/generation/jobs/active')
const { fetchData: loadRecentResultsData } = useApi(() => {
  const limit = showHistory.value ? 50 : 10
  return `/api/generation/results?limit=${limit}`
})

// Computed properties
const sortedActiveJobs = computed(() => {
  return [...activeJobs.value].sort((a, b) => {
    // Sort by status priority, then by creation time
    const statusPriority = { 'processing': 0, 'queued': 1, 'completed': 2, 'failed': 3 }
    const aPriority = statusPriority[a.status] ?? 4
    const bPriority = statusPriority[b.status] ?? 4
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority
    }
    
    return new Date(b.created_at) - new Date(a.created_at)
  })
})

// Lifecycle hooks
onMounted(async () => {
  console.log('Initializing Generation Studio Vue component...')
  
  // Load initial data
  await Promise.all([
    loadSystemStatusData(),
    loadActiveJobsDataFn(),
    loadRecentResultsDataFn()
  ])
  
  // Initialize WebSocket connection
  initWebSocket()
  
  // Start polling as fallback
  startPolling()
  
  // Load parameters from URL or localStorage
  loadSavedParams()
})

onUnmounted(() => {
  cleanup()
})

// Watch for history toggle to reload results
watch(showHistory, () => {
  loadRecentResultsDataFn()
})

// Methods
const loadSystemStatusData = async () => {
  try {
    const result = await loadSystemStatus()
    if (result) {
      systemStatus.value = result
    }
  } catch (error) {
    console.error('Failed to load system status:', error)
  }
}

const loadActiveJobsDataFn = async () => {
  try {
    const result = await loadActiveJobsData()
    if (Array.isArray(result)) {
      activeJobs.value = result
    }
  } catch (error) {
    console.error('Failed to load active jobs:', error)
  }
}

const loadRecentResultsDataFn = async () => {
  try {
    const result = await loadRecentResultsData()
    if (Array.isArray(result)) {
      recentResults.value = result
    }
  } catch (error) {
    console.error('Failed to load recent results:', error)
  }
}

const initWebSocket = () => {
  try {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/ws/generation`
    
    websocket.value = new WebSocket(wsUrl)
    
    websocket.value.onopen = () => {
      console.log('WebSocket connected for generation updates')
      isConnected.value = true
    }
    
    websocket.value.onmessage = (event) => {
      const data = JSON.parse(event.data)
      handleWebSocketMessage(data)
    }
    
    websocket.value.onclose = () => {
      console.log('WebSocket disconnected')
      isConnected.value = false
      // Reconnect after 5 seconds
      setTimeout(() => {
        if (!websocket.value || websocket.value.readyState === WebSocket.CLOSED) {
          initWebSocket()
        }
      }, 5000)
    }
    
    websocket.value.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  } catch (error) {
    console.error('Failed to initialize WebSocket:', error)
  }
}

const handleWebSocketMessage = (data) => {
  switch (data.type) {
    case 'generation_progress':
      updateJobProgress(data.job_id, data.progress, data.status)
      break
    case 'generation_complete':
      handleGenerationComplete(data)
      break
    case 'generation_error':
      handleGenerationError(data)
      break
    case 'queue_update':
      activeJobs.value = data.jobs || []
      break
    case 'system_status':
      systemStatus.value = { ...systemStatus.value, ...data }
      break
    default:
      console.log('Unknown WebSocket message type:', data.type)
  }
}

const startPolling = () => {
  pollInterval.value = setInterval(async () => {
    if (activeJobs.value.length > 0) {
      await loadActiveJobsDataFn()
    }
    await loadSystemStatusData()
  }, 2000)
}

const stopPolling = () => {
  if (pollInterval.value) {
    clearInterval(pollInterval.value)
    pollInterval.value = null
  }
}

const startGeneration = async () => {
  if (!params.value.prompt.trim()) {
    showToast('Please enter a prompt', 'error')
    return
  }
  
  isGenerating.value = true
  
  try {
    const backend = window?.BACKEND_URL || ''
    const response = await fetch(`${backend}/api/generation/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params.value),
    })
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const result = await response.json()
    
    if (result.job_id) {
      // Add job to active jobs list
      const newJob = {
        id: result.job_id,
        prompt: params.value.prompt,
        width: params.value.width,
        height: params.value.height,
        steps: params.value.steps,
        status: 'queued',
        progress: 0,
        current_step: 0,
        total_steps: params.value.steps,
        created_at: new Date().toISOString()
      }
      
      activeJobs.value.unshift(newJob)
      showToast('Generation started successfully', 'success')
      
      // Save parameters to localStorage
      saveParams()
    }
  } catch (error) {
    console.error('Error starting generation:', error)
    showToast('Error starting generation', 'error')
  } finally {
    isGenerating.value = false
  }
}

const cancelJob = async (jobId) => {
  try {
    const backend = window?.BACKEND_URL || ''
    await fetch(`${backend}/api/generation/jobs/${jobId}/cancel`, {
      method: 'POST'
    })
    
    activeJobs.value = activeJobs.value.filter(job => job.id !== jobId)
    showToast('Generation cancelled', 'success')
  } catch (error) {
    console.error('Error cancelling job:', error)
    showToast('Error cancelling generation', 'error')
  }
}

const clearQueue = () => {
  if (activeJobs.value.length === 0) return
  
  if (confirm('Are you sure you want to clear the entire generation queue?')) {
    activeJobs.value.forEach(job => {
      if (job.status === 'queued') {
        cancelJob(job.id)
      }
    })
  }
}

const updateJobProgress = (jobId, progress, status) => {
  const job = activeJobs.value.find(j => j.id === jobId)
  if (job) {
    job.progress = progress
    job.status = status
    
    if (status === 'processing' && progress < 100) {
      job.current_step = Math.floor((progress / 100) * job.total_steps)
    }
  }
}

const handleGenerationComplete = (data) => {
  // Remove from active jobs
  activeJobs.value = activeJobs.value.filter(job => job.id !== data.job_id)
  
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
  })
  
  showToast('Generation completed successfully', 'success')
}

const handleGenerationError = (data) => {
  // Remove from active jobs
  activeJobs.value = activeJobs.value.filter(job => job.id !== data.job_id)
  
  showToast(`Generation failed: ${data.error}`, 'error')
}

const showImageModal = (result) => {
  selectedResult.value = result
  showModal.value = true
}

const hideImageModal = () => {
  showModal.value = false
  selectedResult.value = null
}

const reuseParameters = (result) => {
  params.value.prompt = result.prompt
  params.value.negative_prompt = result.negative_prompt || ''
  params.value.width = result.width
  params.value.height = result.height
  params.value.steps = result.steps
  params.value.cfg_scale = result.cfg_scale
  params.value.seed = result.seed
  
  showToast('Parameters loaded from result', 'success')
}

const deleteResult = async (resultId) => {
  if (!confirm('Are you sure you want to delete this result?')) return
  
  try {
    const backend = window?.BACKEND_URL || ''
    await fetch(`${backend}/api/generation/results/${resultId}`, {
      method: 'DELETE'
    })
    
    recentResults.value = recentResults.value.filter(r => r.id !== resultId)
    showToast('Result deleted', 'success')
  } catch (error) {
    console.error('Error deleting result:', error)
    showToast('Error deleting result', 'error')
  }
}

const refreshResults = async () => {
  await loadRecentResultsDataFn()
  showToast('Results refreshed', 'success')
}

const loadFromComposer = () => {
  try {
    const composerData = localStorage.getItem('composerPrompt')
    if (composerData) {
      params.value.prompt = composerData
      showToast('Loaded prompt from composer', 'success')
    } else {
      showToast('No composer data found', 'warning')
    }
  } catch (error) {
    console.error('Error loading composer data:', error)
  }
}

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
  ]
  
  params.value.prompt = randomPrompts[Math.floor(Math.random() * randomPrompts.length)]
  showToast('Random prompt generated', 'success')
}

const savePreset = () => {
  const presetName = prompt('Enter a name for this preset:')
  if (!presetName) return
  
  const preset = {
    name: presetName,
    params: { ...params.value },
    created_at: new Date().toISOString()
  }
  
  try {
    const savedPresets = JSON.parse(localStorage.getItem('generationPresets') || '[]')
    savedPresets.push(preset)
    localStorage.setItem('generationPresets', JSON.stringify(savedPresets))
    
    showToast(`Preset "${presetName}" saved`, 'success')
  } catch (error) {
    console.error('Failed to save preset:', error)
    showToast('Failed to save preset', 'error')
  }
}

const loadSavedParams = () => {
  try {
    // Load from URL parameters first
    const urlParams = new URLSearchParams(window.location.search)
    if (urlParams.has('prompt')) {
      params.value.prompt = urlParams.get('prompt')
    }
    
    // Then load saved parameters from localStorage
    const saved = localStorage.getItem('generation_params')
    if (saved) {
      const parsed = JSON.parse(saved)
      Object.assign(params.value, parsed)
    }
  } catch (error) {
    console.error('Error loading saved parameters:', error)
  }
}

const saveParams = () => {
  try {
    localStorage.setItem('generation_params', JSON.stringify(params.value))
  } catch (error) {
    console.error('Error saving parameters:', error)
  }
}

const cleanup = () => {
  if (websocket.value) {
    websocket.value.close()
  }
  stopPolling()
}

// Utility functions
const formatTime = (dateString) => {
  if (!dateString) return 'Unknown'
  
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diff = Math.floor((now - date) / 1000)
    
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  } catch {
    return 'Unknown'
  }
}

const getJobStatusClasses = (status) => {
  switch (status) {
    case 'processing':
      return 'bg-blue-100 text-blue-800'
    case 'queued':
      return 'bg-yellow-100 text-yellow-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'failed':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

const getJobStatusText = (status) => {
  switch (status) {
    case 'processing':
      return 'Processing'
    case 'queued':
      return 'Queued'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    default:
      return 'Unknown'
  }
}

const canCancelJob = (job) => {
  return job.status === 'queued' || job.status === 'processing'
}

const getSystemStatusClasses = (status) => {
  switch (status) {
    case 'healthy':
      return 'text-green-600'
    case 'degraded':
      return 'text-yellow-600'
    case 'unhealthy':
      return 'text-red-600'
    default:
      return 'text-gray-600'
  }
}

const showToast = (message, type = 'success') => {
  // For now, use console.log - in a real app this would integrate with a toast system
  console.log(`[${type.toUpperCase()}] ${message}`)
  
  // Try to use global Alpine store if available
  if (window.Alpine && window.Alpine.store) {
    const store = window.Alpine.store('app')
    if (store && store.addNotification) {
      store.addNotification(message, type)
    }
  }
}

// Auto-save parameters on change
watch(params, () => {
  saveParams()
}, { deep: true })
</script>