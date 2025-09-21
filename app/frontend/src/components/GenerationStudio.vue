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
                    <span>{{ job.width ?? '—' }}×{{ job.height ?? '—' }} • {{ job.steps ?? '—' }} steps</span>
                    <span>{{ formatTime(job.created_at ?? job.startTime) }}</span>
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
                    {{ result.prompt ?? 'Untitled Generation' }}
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
                  v-if="selectedResult?.image_url"
                  :src="selectedResult.image_url"
                  :alt="selectedResult?.prompt ?? 'Generated image'"
                  class="w-full"
                >
                <div class="p-4">
                  <h3 class="text-lg font-medium text-gray-900 mb-2">Generation Details</h3>
                  <div class="space-y-1 text-sm text-gray-600">
                    <div><strong>Prompt:</strong> {{ selectedResult?.prompt ?? 'Unknown prompt' }}</div>
                    <div>
                      <strong>Size:</strong>
                      {{ selectedResult?.width ?? '—' }}×{{ selectedResult?.height ?? '—' }}
                    </div>
                    <div><strong>Steps:</strong> {{ selectedResult?.steps ?? '—' }}</div>
                    <div><strong>CFG Scale:</strong> {{ selectedResult?.cfg_scale ?? '—' }}</div>
                    <div><strong>Seed:</strong> {{ selectedResult?.seed ?? '—' }}</div>
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

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'

import { useActiveJobsApi, useRecentResultsApi, useSystemStatusApi } from '@/composables/apiClients'
import {
  cancelGenerationJob,
  deleteGenerationResult,
  resolveBackendUrl,
  resolveGenerationBaseUrl,
  startGeneration as startGenerationRequest,
  toGenerationRequestPayload,
} from '@/services/generationService'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationFormState,
  GenerationJob,
  GenerationProgressMessage,
  GenerationResult,
  NotificationType,
  ProgressUpdate,
  SystemStatusPayload,
  SystemStatusState,
  WebSocketMessage,
} from '@/types'

const appStore = useAppStore()
const { activeJobs, recentResults } = storeToRefs(appStore)
const settingsStore = useSettingsStore()
const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore)

const params = ref<GenerationFormState>({
  prompt: '',
  negative_prompt: '',
  steps: 20,
  sampler_name: 'DPM++ 2M',
  cfg_scale: 7.0,
  width: 512,
  height: 512,
  seed: -1,
  batch_size: 1,
  batch_count: 1,
  denoising_strength: null,
})

const systemStatus = ref<SystemStatusState>({ ...appStore.systemStatus })
const isGenerating = ref(false)
const showHistory = ref(false)
const showModal = ref(false)
const selectedResult = ref<GenerationResult | null>(null)

const websocket = ref<WebSocket | null>(null)
const pollInterval = ref<number | null>(null)
const isConnected = computed<boolean>(() => websocket.value?.readyState === WebSocket.OPEN)

const appendWebSocketPath = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed ? `${trimmed}/ws/progress` : '/ws/progress'
}

const resolveWebSocketUrl = (backendUrl?: string | null): string => {
  const base = resolveGenerationBaseUrl(backendUrl)

  if (/^https?:\/\//i.test(base)) {
    try {
      const url = new URL(base)
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${protocol}//${url.host}${appendWebSocketPath(url.pathname)}`
    } catch (error) {
      console.error('Failed to parse backend URL for WebSocket:', error)
    }
  }

  const wsPath = appendWebSocketPath(base)

  if (typeof window === 'undefined') {
    return wsPath
  }

  const normalizedPath = wsPath.startsWith('/') ? wsPath : `/${wsPath}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${normalizedPath}`
}

const websocketUrl = computed<string>(() => resolveWebSocketUrl(configuredBackendUrl.value))

const logDebug = (...args: unknown[]): void => {
  if (import.meta.env.DEV) {
    console.info('[GenerationStudio]', ...args)
  }
}

const parseTimestamp = (value?: string): number => {
  if (!value) {
    return 0
  }
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const normalizeProgress = (value?: number | null): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return value <= 1 ? Math.round(value * 100) : Math.round(value)
}

const isGenerationProgressMessage = (
  message: WebSocketMessage,
): message is GenerationProgressMessage => message.type === 'generation_progress'

const isGenerationCompleteMessage = (
  message: WebSocketMessage,
): message is GenerationCompleteMessage => message.type === 'generation_complete'

const isGenerationErrorMessage = (
  message: WebSocketMessage,
): message is GenerationErrorMessage => message.type === 'generation_error'

const { fetchData: loadSystemStatus } = useSystemStatusApi()
const { fetchData: loadActiveJobsData } = useActiveJobsApi()
const { fetchData: loadRecentResultsData } = useRecentResultsApi(() => {
  const limit = showHistory.value ? 50 : 10
  return resolveBackendUrl(`/generation/results?limit=${limit}`, configuredBackendUrl.value)
})

const sortedActiveJobs: ComputedRef<GenerationJob[]> = computed(() => {
  const statusPriority: Record<string, number> = {
    processing: 0,
    queued: 1,
    completed: 2,
    failed: 3,
  }

  return [...activeJobs.value].sort((a, b) => {
    const aPriority = statusPriority[a.status] ?? 4
    const bPriority = statusPriority[b.status] ?? 4

    if (aPriority !== bPriority) {
      return aPriority - bPriority
    }

    const aCreated = parseTimestamp(a.created_at ?? a.startTime)
    const bCreated = parseTimestamp(b.created_at ?? b.startTime)

    return bCreated - aCreated
  })
})

const loadSystemStatusData = async (): Promise<void> => {
  try {
    const result = await loadSystemStatus()
    if (result) {
      const payload = result as SystemStatusPayload
      const { metrics: _metrics, message: _message, updated_at: _updatedAt, ...status } = payload
      systemStatus.value = {
        ...systemStatus.value,
        ...(status as Partial<SystemStatusState>),
      }
      appStore.updateSystemStatus(status as Partial<SystemStatusState>)
    }
  } catch (error) {
    console.error('Failed to load system status:', error)
  }
}

const loadActiveJobsDataFn = async (): Promise<void> => {
  try {
    const result = await loadActiveJobsData()
    if (Array.isArray(result)) {
      appStore.setActiveJobs(result)
    }
  } catch (error) {
    console.error('Failed to load active jobs:', error)
  }
}

const loadRecentResultsDataFn = async (): Promise<void> => {
  try {
    const result = await loadRecentResultsData()
    if (Array.isArray(result)) {
      appStore.setRecentResults(result)
    }
  } catch (error) {
    console.error('Failed to load recent results:', error)
  }
}

const initWebSocket = (): void => {
  try {
    const wsUrl = websocketUrl.value

    if (websocket.value) {
      websocket.value.onclose = null
      websocket.value.close()
    }

    const connection = new WebSocket(wsUrl)
    websocket.value = connection

    connection.onopen = () => {
      logDebug('WebSocket connected for generation updates')
    }

    connection.onmessage = (event: MessageEvent<string>) => {
      try {
        const data = JSON.parse(event.data) as WebSocketMessage
        handleWebSocketMessage(data)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    }

    connection.onclose = () => {
      logDebug('WebSocket disconnected')
      websocket.value = null
      window.setTimeout(() => {
        if (!websocket.value) {
          initWebSocket()
        }
      }, 5000)
    }

    connection.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  } catch (error) {
    console.error('Failed to initialize WebSocket:', error)
  }
}

const handleWebSocketMessage = (data: WebSocketMessage): void => {
  if (!data || typeof data !== 'object' || !('type' in data)) {
    return
  }

  switch (data.type) {
    case 'generation_progress':
      if (isGenerationProgressMessage(data)) {
        updateJobProgress(data)
      }
      break
    case 'generation_complete':
      if (isGenerationCompleteMessage(data)) {
        handleGenerationComplete(data)
      }
      break
    case 'generation_error':
      if (isGenerationErrorMessage(data)) {
        handleGenerationError(data)
      }
      break
    case 'queue_update':
      if (Array.isArray(data.jobs)) {
        appStore.setActiveJobs(data.jobs)
      }
      break
    case 'system_status': {
      const { metrics: _metrics, message: _message, updated_at: _updatedAt, type: _type, ...status } = data
      systemStatus.value = {
        ...systemStatus.value,
        ...(status as Partial<SystemStatusState>),
      }
      appStore.updateSystemStatus(status as Partial<SystemStatusState>)
      break
    }
    case 'generation_started':
      logDebug('Generation job started', data.job_id)
      break
    default:
      logDebug('Unknown WebSocket message type:', (data as { type?: string }).type)
  }
}

const startPolling = (): void => {
  if (pollInterval.value) {
    return
  }
  pollInterval.value = window.setInterval(async () => {
    if (activeJobs.value.length > 0) {
      await loadActiveJobsDataFn()
    }
    await loadSystemStatusData()
  }, 2000)
}

const stopPolling = (): void => {
  if (pollInterval.value != null) {
    window.clearInterval(pollInterval.value)
    pollInterval.value = null
  }
}

const startGeneration = async (): Promise<void> => {
  const trimmedPrompt = params.value.prompt.trim()
  if (!trimmedPrompt) {
    showToast('Please enter a prompt', 'error')
    return
  }

  isGenerating.value = true

  try {
    params.value.prompt = trimmedPrompt
    const payload = toGenerationRequestPayload({ ...params.value, prompt: trimmedPrompt })
    const response = await startGenerationRequest(payload)

    if (response.job_id) {
      const createdAt = new Date().toISOString()
      const newJob: GenerationJob = {
        id: response.job_id,
        prompt: payload.prompt,
        status: response.status as GenerationJob['status'],
        progress: normalizeProgress(response.progress),
        startTime: createdAt,
        created_at: createdAt,
        width: payload.width,
        height: payload.height,
        steps: payload.steps,
        total_steps: payload.steps,
        cfg_scale: payload.cfg_scale,
        seed: payload.seed,
      }

      appStore.addJob(newJob)
      showToast('Generation started successfully', 'success')
      saveParams(params.value)
    }
  } catch (error) {
    console.error('Error starting generation:', error)
    showToast('Error starting generation', 'error')
  } finally {
    isGenerating.value = false
  }
}

const cancelJob = async (jobId: string): Promise<void> => {
  try {
    await cancelGenerationJob(jobId)
    appStore.removeJob(jobId)
    showToast('Generation cancelled', 'success')
  } catch (error) {
    console.error('Error cancelling job:', error)
    showToast('Error cancelling generation', 'error')
  }
}

const clearQueue = async (): Promise<void> => {
  if (activeJobs.value.length === 0) {
    return
  }

  if (!window.confirm('Are you sure you want to clear the entire generation queue?')) {
    return
  }

  const cancellableJobs = activeJobs.value.filter((job) => canCancelJob(job))
  await Promise.allSettled(cancellableJobs.map((job) => cancelJob(job.id)))
}

const updateJobProgress = (update: ProgressUpdate): void => {
  const job = activeJobs.value.find((item) => item.id === update.job_id)
  if (!job) {
    return
  }

  job.progress = normalizeProgress(update.progress)
  job.status = update.status as GenerationJob['status']

  if (typeof update.current_step === 'number') {
    job.current_step = update.current_step
  }

  if (typeof update.total_steps === 'number') {
    job.total_steps = update.total_steps
  }
}

const handleGenerationComplete = (data: Extract<WebSocketMessage, { type: 'generation_complete' }>): void => {
  appStore.removeJob(data.job_id)

  const createdAt = data.created_at ?? new Date().toISOString()
  const imageUrl = data.image_url ?? (Array.isArray(data.images) ? data.images[0] ?? null : null)

  const result: GenerationResult = {
    id: data.result_id ?? data.job_id,
    job_id: data.job_id,
    result_id: data.result_id,
    prompt: data.prompt,
    negative_prompt: data.negative_prompt,
    image_url: imageUrl,
    width: data.width,
    height: data.height,
    steps: data.steps,
    cfg_scale: data.cfg_scale,
    seed: data.seed ?? null,
    created_at: createdAt,
  }

  appStore.addResult(result)
  showToast('Generation completed successfully', 'success')
}

const handleGenerationError = (data: Extract<WebSocketMessage, { type: 'generation_error' }>): void => {
  appStore.removeJob(data.job_id)
  showToast(`Generation failed: ${data.error}`, 'error')
}

const showImageModal = (result: GenerationResult | null): void => {
  if (!result) {
    return
  }
  selectedResult.value = result
  showModal.value = true
}

const hideImageModal = (): void => {
  showModal.value = false
  selectedResult.value = null
}

const reuseParameters = (result: GenerationResult): void => {
  if (typeof result.prompt === 'string') {
    params.value.prompt = result.prompt
  }
  params.value.negative_prompt = typeof result.negative_prompt === 'string' ? result.negative_prompt : ''
  if (typeof result.width === 'number') {
    params.value.width = result.width
  }
  if (typeof result.height === 'number') {
    params.value.height = result.height
  }
  if (typeof result.steps === 'number') {
    params.value.steps = result.steps
  }
  if (typeof result.cfg_scale === 'number') {
    params.value.cfg_scale = result.cfg_scale
  }
  if (typeof result.seed === 'number') {
    params.value.seed = result.seed
  }

  showToast('Parameters loaded from result', 'success')
}

const deleteResult = async (resultId: string | number): Promise<void> => {
  if (!window.confirm('Are you sure you want to delete this result?')) {
    return
  }

  try {
    await deleteGenerationResult(resultId)
    const filtered = recentResults.value.filter((result) => result.id !== resultId)
    appStore.setRecentResults(filtered)
    showToast('Result deleted', 'success')
  } catch (error) {
    console.error('Error deleting result:', error)
    showToast('Error deleting result', 'error')
  }
}

const refreshResults = async (): Promise<void> => {
  await loadRecentResultsDataFn()
  showToast('Results refreshed', 'success')
}

const loadFromComposer = (): void => {
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

const useRandomPrompt = (): void => {
  const randomPrompts: readonly string[] = [
    'a beautiful anime girl with long flowing hair',
    'a majestic dragon soaring through cloudy skies',
    'a cyberpunk cityscape with neon lights',
    'a serene landscape with mountains and a lake',
    'a cute robot in a futuristic laboratory',
    'a magical forest with glowing mushrooms',
    'a space station orbiting a distant planet',
    'a steampunk airship flying over Victorian city',
  ]

  const index = Math.floor(Math.random() * randomPrompts.length)
  params.value.prompt = randomPrompts[index]
  showToast('Random prompt generated', 'success')
}

const savePreset = (): void => {
  const presetName = window.prompt('Enter a name for this preset:')
  if (!presetName) {
    return
  }

  const preset = {
    name: presetName,
    params: { ...params.value },
    created_at: new Date().toISOString(),
  }

  try {
    const savedPresets = JSON.parse(localStorage.getItem('generationPresets') ?? '[]') as unknown[]
    savedPresets.push(preset)
    localStorage.setItem('generationPresets', JSON.stringify(savedPresets))
    showToast(`Preset "${presetName}" saved`, 'success')
  } catch (error) {
    console.error('Failed to save preset:', error)
    showToast('Failed to save preset', 'error')
  }
}

const loadSavedParams = (): void => {
  try {
    const urlParams = new URLSearchParams(window.location.search)
    const prompt = urlParams.get('prompt')
    if (typeof prompt === 'string') {
      params.value.prompt = prompt
    }

    const saved = localStorage.getItem('generation_params')
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<GenerationFormState>
      Object.assign(params.value, parsed)
    }
  } catch (error) {
    console.error('Error loading saved parameters:', error)
  }
}

const saveParams = (value: GenerationFormState = params.value): void => {
  try {
    localStorage.setItem('generation_params', JSON.stringify(value))
  } catch (error) {
    console.error('Error saving parameters:', error)
  }
}

const cleanup = (): void => {
  if (websocket.value) {
    websocket.value.onclose = null
    websocket.value.close()
    websocket.value = null
  }
  stopPolling()
}

const formatTime = (dateString?: string): string => {
  if (!dateString) {
    return 'Unknown'
  }

  try {
    const date = new Date(dateString)
    const now = new Date()
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  } catch {
    return 'Unknown'
  }
}

const getJobStatusClasses = (status: GenerationJob['status']): string => {
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

const getJobStatusText = (status: GenerationJob['status']): string => {
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

const canCancelJob = (job: GenerationJob): boolean => {
  return job.status === 'queued' || job.status === 'processing'
}

const getSystemStatusClasses = (status?: string): string => {
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

const showToast = (message: string, type: NotificationType = 'success'): void => {
  logDebug(`[${type.toUpperCase()}] ${message}`)
  appStore.addNotification(message, type)
}

watch(showHistory, () => {
  void loadRecentResultsDataFn()
})

watch(params, (newParams) => {
  saveParams(newParams)
}, { deep: true })

watch(isConnected, (connected) => {
  logDebug('WebSocket connection state changed:', connected)
})

watch(websocketUrl, (newUrl, oldUrl) => {
  if (!newUrl || newUrl === oldUrl) {
    return
  }

  if (websocket.value) {
    const currentConnection = websocket.value
    currentConnection.onclose = null
    try {
      currentConnection.close()
    } catch (error) {
      console.error('Failed to close existing WebSocket connection:', error)
    } finally {
      websocket.value = null
    }
  }

  initWebSocket()
})

onMounted(async () => {
  logDebug('Initializing Generation Studio Vue component...')

  await Promise.all([
    loadSystemStatusData(),
    loadActiveJobsDataFn(),
    loadRecentResultsDataFn(),
  ])

  initWebSocket()
  startPolling()
  loadSavedParams()
})

onUnmounted(() => {
  cleanup()
})
</script>
