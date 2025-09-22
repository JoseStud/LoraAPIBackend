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
import { useGenerationStudio } from '@/composables/useGenerationStudio'

const {
  params,
  systemStatus,
  isGenerating,
  showHistory,
  showModal,
  selectedResult,
  activeJobs,
  recentResults,
  sortedActiveJobs,
  startGeneration,
  cancelJob,
  clearQueue,
  refreshResults,
  loadFromComposer,
  useRandomPrompt,
  savePreset,
  showImageModal,
  hideImageModal,
  reuseParameters,
  deleteResult,
  formatTime,
  getJobStatusClasses,
  getJobStatusText,
  canCancelJob,
  getSystemStatusClasses,
} = useGenerationStudio()
</script>
