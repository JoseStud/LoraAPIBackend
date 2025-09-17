<template>
<<<<<<< HEAD
  <div class="compose-page-container" v-cloak>
    <!-- Loading State -->
    <div v-show="!isInitialized" class="py-12 text-center text-gray-500">
      <svg class="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25"></circle>
        <path d="M4 12a8 8 0 018-8" stroke-width="4" class="opacity-75"></path>
      </svg>
      <div>Loading composer...</div>
    </div>

    <div v-show="isInitialized">
      <!-- Page Header -->
      <div class="page-header">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="page-title">Prompt Composer</h1>
            <p class="page-subtitle">Build and compose prompts with LoRAs</p>
          </div>
          <div class="header-actions">
            <button @click="loadComposition" class="btn btn-secondary btn-sm">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
              </svg>
              Load Composition
            </button>
            <button @click="clearComposition" class="btn btn-secondary btn-sm">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
              </svg>
              Clear All
            </button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Left Panel: Available LoRAs -->
        <div class="lg:col-span-1">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Available LoRAs</h3>
            </div>
            <div class="card-body">
              <!-- Search and Filters -->
              <div class="mb-4">
                <div class="search-bar-container">
                  <input 
                    type="text" 
                    v-model="searchTerm" 
                    @input="debouncedFilterLoras"
                    placeholder="Search LoRAs..."
                    class="search-input"
                  >
                  <div class="search-icon-container">
                    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                  </div>
                </div>
                
                <!-- Quick Filters -->
                <div class="flex items-center space-x-3 mt-3">
                  <label class="checkbox-label">
                    <input 
                      type="checkbox" 
                      v-model="activeOnly" 
                      @change="filterLoras"
                      class="form-checkbox"
                    >
                    <span class="checkbox-text">Active Only</span>
                  </label>
                </div>
              </div>

              <!-- Available LoRAs List -->
              <div class="space-y-2 max-h-96 overflow-y-auto">
                <div 
                  v-for="lora in filteredLoras" 
                  :key="lora.id"
                  class="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg cursor-pointer"
                  @click="addToComposition(lora)"
                  :class="{ 'opacity-50': isInComposition(lora.id) }"
                >
                  <div class="flex-1 min-w-0">
                    <div class="font-medium text-sm text-gray-900 truncate">{{ lora.name }}</div>
                    <div class="text-xs text-gray-500">{{ lora.description || 'No description' }}</div>
                    <div class="flex items-center space-x-2 mt-1">
                      <span 
                        class="status-badge-sm"
                        :class="lora.active ? 'status-badge-active' : 'status-badge-inactive'"
                      >
                        {{ lora.active ? 'Active' : 'Inactive' }}
                      </span>
                      <div v-if="lora.tags && lora.tags.length > 0" class="flex space-x-1">
                        <span 
                          v-for="tag in lora.tags.slice(0, 2)" 
                          :key="tag"
                          class="tag tag-xs tag-gray"
                        >
                          {{ tag }}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div class="flex-shrink-0 ml-3">
                    <svg v-if="!isInComposition(lora.id)" class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                    <svg v-else class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  </div>
                </div>
                
                <!-- Empty State -->
                <div v-if="filteredLoras.length === 0" class="empty-state-container">
                  <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6-4h6m2 5.291A7.962 7.962 0 0112 15c-2.34 0-4.29-1.009-5.71-2.596"></path>
                  </svg>
                  <div class="empty-state-title">No LoRAs found</div>
                  <div class="empty-state-message">Try adjusting your search or filters</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Center Panel: Active Composition -->
        <div class="lg:col-span-1">
          <div class="card">
            <div class="card-header">
              <div class="flex items-center justify-between">
                <h3 class="card-title">Active Composition</h3>
                <span class="text-sm text-gray-500">{{ activeLoras.length }} LoRAs</span>
              </div>
            </div>
            <div class="card-body">
              <!-- Composition Controls -->
              <div class="mb-4">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="form-label">Total Weight</label>
                    <div 
                      class="text-lg font-semibold"
                      :class="totalWeight > 1.5 ? 'text-red-600' : totalWeight > 1.2 ? 'text-yellow-600' : 'text-green-600'"
                    >
                      {{ totalWeight.toFixed(2) }}
                    </div>
                  </div>
                  <div>
                    <label class="form-label">Normalize</label>
                    <button 
                      @click="normalizeWeights" 
                      class="btn btn-sm btn-secondary w-full"
                      :disabled="activeLoras.length === 0"
                    >
                      Auto-balance
                    </button>
                  </div>
                </div>
              </div>

              <!-- Active LoRAs (Sortable) -->
              <div class="space-y-2 max-h-96 overflow-y-auto" id="sortable-loras">
                <div 
                  v-for="(lora, index) in activeLoras" 
                  :key="lora.id"
                  class="composition-item bg-white border border-gray-200 rounded-lg p-3 cursor-move"
                  :class="{ 'border-blue-300 shadow-sm': draggedIndex === index }"
                  @dragstart="handleDragStart(index, $event)"
                  @dragover.prevent="handleDragOver(index, $event)"
                  @drop="handleDrop(index, $event)"
                  @dragend="handleDragEnd($event)"
                  draggable="true"
                >
                  <!-- Drag Handle -->
                  <div class="flex items-center space-x-3">
                    <div class="drag-handle flex-shrink-0 text-gray-400">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16"></path>
                      </svg>
                    </div>
                    
                    <!-- LoRA Info -->
                    <div class="flex-1 min-w-0">
                      <div class="font-medium text-sm text-gray-900 truncate">{{ lora.name }}</div>
                      <div class="text-xs text-gray-500">Weight: {{ lora.weight }}</div>
                    </div>
                    
                    <!-- Remove Button -->
                    <button 
                      @click="removeFromComposition(index)" 
                      class="flex-shrink-0 text-gray-400 hover:text-red-500"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                      </svg>
                    </button>
                  </div>
                  
                  <!-- Weight Slider -->
                  <div class="mt-3">
                    <div class="flex items-center justify-between mb-1">
                      <label class="text-xs font-medium text-gray-700">Weight</label>
                      <span class="text-xs text-gray-600">{{ lora.weight }}</span>
                    </div>
                    <input 
                      type="range" 
                      v-model="lora.weight" 
                      @input="updatePrompt"
                      min="0" max="2" step="0.05" 
                      class="weight-slider-input w-full"
                    >
                    <div class="slider-labels">
                      <span>0</span>
                      <span>1</span>
                      <span>2</span>
                    </div>
                  </div>
                </div>
                
                <!-- Empty State -->
                <div v-if="activeLoras.length === 0" class="empty-state-container">
                  <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                  </svg>
                  <div class="empty-state-title">No LoRAs in composition</div>
                  <div class="empty-state-message">Add LoRAs from the left panel to start composing</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Panel: Prompt Generation & Actions -->
        <div class="lg:col-span-1">
          <div class="space-y-6">
            <!-- Generated Prompt -->
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Generated Prompt</h3>
              </div>
              <div class="card-body">
                <!-- Base Prompt Input -->
                <div class="mb-4">
                  <label class="form-label">Base Prompt</label>
                  <textarea 
                    v-model="basePrompt" 
                    @input="updatePrompt"
                    placeholder="Enter your base prompt (e.g., 'a beautiful anime girl')"
                    class="form-input h-20 resize-none"
                  ></textarea>
                  <div v-if="validation.basePrompt.error" class="text-red-600 text-sm mt-1">
                    {{ validation.basePrompt.message }}
                  </div>
                </div>
                
                <!-- Negative Prompt Input -->
                <div class="mb-4">
                  <label class="form-label">Negative Prompt</label>
                  <textarea 
                    v-model="negativePrompt" 
                    placeholder="Enter negative prompt (e.g., 'low quality, blurry')"
                    class="form-input h-16 resize-none"
                  ></textarea>
                </div>
                
                <!-- Final Prompt Display -->
                <div class="mb-4">
                  <label class="form-label">Complete Prompt</label>
                  <textarea 
                    v-model="finalPrompt" 
                    readonly
                    class="form-input h-32 bg-gray-50 font-mono text-sm resize-none"
                    placeholder="Your final prompt will appear here..."
                  ></textarea>
                </div>
                
                <!-- Actions -->
                <div class="space-y-2">
                  <button 
                    @click="copyPrompt" 
                    class="btn btn-secondary w-full"
                    :disabled="!finalPrompt"
                  >
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                    </svg>
                    Copy Prompt
                  </button>
                  
                  <button 
                    @click="saveComposition" 
                    class="btn btn-secondary w-full"
                    :disabled="activeLoras.length === 0"
                  >
                    <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path>
                    </svg>
                    Save Composition
                  </button>
                  
                  <button 
                    @click="generateImage" 
                    class="btn btn-primary w-full"
                    :disabled="!finalPrompt || isGenerating || !validation.isValid"
                  >
                    <div v-if="!isGenerating" class="flex items-center justify-center">
                      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                      </svg>
                      Generate Image
                    </div>
                    <div v-else class="flex items-center justify-center">
                      <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
                      </svg>
                      Generating...
                    </div>
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Quick Actions -->
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Quick Actions</h3>
              </div>
              <div class="card-body">
                <div class="space-y-2">
                  <button @click="addRandomLoras(3)" class="btn btn-secondary btn-sm w-full">
                    Add 3 Random LoRAs
                  </button>
                  <button 
                    @click="balanceWeights" 
                    class="btn btn-secondary btn-sm w-full"
                    :disabled="activeLoras.length === 0"
                  >
                    Balance All Weights
                  </button>
                  <button 
                    @click="duplicateComposition" 
                    class="btn btn-secondary btn-sm w-full"
                    :disabled="activeLoras.length === 0"
                  >
                    Duplicate Composition
                  </button>
                </div>
              </div>
            </div>
          </div>
=======
  <div class="space-y-6">
    <!-- Header -->
    <div class="page-header">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="page-title">Prompt Composer</h1>
          <p class="page-subtitle">Build and compose prompts with LoRAs</p>
        </div>
        <div class="header-actions flex gap-2">
          <button class="btn btn-secondary btn-sm" @click="loadComposition">Load Composition</button>
          <button class="btn btn-secondary btn-sm" @click="clearComposition" :disabled="activeLoras.length === 0">Clear All</button>
>>>>>>> temp/fe-106-migration
        </div>
      </div>
    </div>

<<<<<<< HEAD
    <!-- Toast Notifications -->
    <div 
      v-show="showToast" 
      class="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg"
      :class="toastType === 'error' ? 'bg-red-500' : toastType === 'warning' ? 'bg-yellow-500' : 'bg-green-500'"
    >
      {{ toastMessage }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';

// Reactive state
const isInitialized = ref(false);
const availableLoras = ref([]);
const filteredLoras = ref([]);
const activeLoras = ref([]);
const searchTerm = ref('');
const activeOnly = ref(false);
const basePrompt = ref('');
const negativePrompt = ref('');
const finalPrompt = ref('');

// UI state
const isLoading = ref(false);
const isGenerating = ref(false);
const showToast = ref(false);
const toastMessage = ref('');
const toastType = ref('success');
const draggedIndex = ref(null);

// Validation state
const validation = ref({
  basePrompt: { error: false, message: '' },
  isValid: true
});

// Computed properties
const totalWeight = computed(() => {
  return activeLoras.value.reduce((sum, lora) => sum + parseFloat(lora.weight || 0), 0);
});

// Debounced search function
let searchTimeout;
const debouncedFilterLoras = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(filterLoras, 300);
};

// Validation functions
const validateBasePrompt = () => {
  const prompt = basePrompt.value.trim();
  if (!prompt) {
    validation.value.basePrompt = { error: true, message: 'Base prompt is required' };
    return false;
  }
  if (prompt.length > 1000) {
    validation.value.basePrompt = { error: true, message: 'Prompt is too long (max 1000 characters)' };
    return false;
  }
  validation.value.basePrompt = { error: false, message: '' };
  return true;
};

const updateValidation = () => {
  const basePromptValid = validateBasePrompt();
  validation.value.isValid = basePromptValid && finalPrompt.value.trim() !== '';
};

// Initialization
const init = async () => {
  console.log('Initializing Prompt Composer...');
  await loadAvailableLoras();
  updatePrompt();
  isInitialized.value = true;
};

// API Methods
const loadAvailableLoras = async () => {
  isLoading.value = true;
  try {
    const response = await fetch((window?.BACKEND_URL || '') + '/adapters');
    if (response.ok) {
      availableLoras.value = await response.json();
      filterLoras();
    } else {
      console.error('Failed to load LoRAs:', response.statusText);
      showToastMessage('Failed to load LoRAs', 'error');
    }
  } catch (error) {
    console.error('Error loading LoRAs:', error);
    showToastMessage('Error loading LoRAs', 'error');
  } finally {
    isLoading.value = false;
  }
};

// Filtering and Search
const filterLoras = () => {
  let filtered = [...availableLoras.value];
  
  // Apply search filter
  if (searchTerm.value.trim()) {
    const term = searchTerm.value.toLowerCase();
    filtered = filtered.filter(lora => 
      lora.name.toLowerCase().includes(term) ||
      (lora.description && lora.description.toLowerCase().includes(term)) ||
      (lora.tags && lora.tags.some(tag => tag.toLowerCase().includes(term)))
    );
  }
  
  // Apply active filter
  if (activeOnly.value) {
    filtered = filtered.filter(lora => lora.active);
  }
  
  filteredLoras.value = filtered;
};

// Composition Management
const addToComposition = (lora) => {
  if (isInComposition(lora.id)) {
    showToastMessage('LoRA already in composition', 'warning');
    return;
  }
  
  const compositionLora = {
    ...lora,
    weight: 1.0,
    order: activeLoras.value.length
  };
  
  activeLoras.value.push(compositionLora);
  showToastMessage(`Added ${lora.name} to composition`, 'success');
};

const removeFromComposition = (index) => {
  const lora = activeLoras.value[index];
  activeLoras.value.splice(index, 1);
  showToastMessage(`Removed ${lora.name} from composition`, 'success');
};

const clearComposition = () => {
  if (activeLoras.value.length === 0) return;
  
  if (confirm('Are you sure you want to clear the entire composition?')) {
    activeLoras.value = [];
    basePrompt.value = '';
    negativePrompt.value = '';
    showToastMessage('Composition cleared', 'success');
  }
};

const isInComposition = (loraId) => {
  return activeLoras.value.some(lora => lora.id === loraId);
};

// Drag and Drop Handlers
const handleDragStart = (index, event) => {
  draggedIndex.value = index;
  event.dataTransfer.setData('text/plain', index.toString());
  event.target.style.opacity = '0.5';
};

const handleDragOver = (index, event) => {
  event.preventDefault();
  // Add visual feedback
  if (draggedIndex.value !== null && draggedIndex.value !== index) {
    event.target.style.borderTop = '2px solid #3b82f6';
  }
};

const handleDrop = (index, event) => {
  event.preventDefault();
  event.target.style.borderTop = '';
  
  const draggedIndexValue = parseInt(event.dataTransfer.getData('text/plain'));
  if (draggedIndexValue !== index) {
    reorderLoras(draggedIndexValue, index);
  }
};

const handleDragEnd = (event) => {
  event.target.style.opacity = '';
  event.target.style.borderTop = '';
  draggedIndex.value = null;
};

const reorderLoras = (fromIndex, toIndex) => {
  const item = activeLoras.value.splice(fromIndex, 1)[0];
  activeLoras.value.splice(toIndex, 0, item);
  showToastMessage('LoRAs reordered', 'success');
};

// Weight Management
const normalizeWeights = () => {
  if (activeLoras.value.length === 0) return;
  
  const totalWeightValue = totalWeight.value;
  if (totalWeightValue > 0) {
    activeLoras.value.forEach(lora => {
      lora.weight = (parseFloat(lora.weight) / totalWeightValue).toFixed(2);
    });
    showToastMessage('Weights normalized', 'success');
  }
=======
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: Available LoRAs -->
      <div class="lg:col-span-1">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Available LoRAs</h3>
          </div>
          <div class="card-body space-y-4">
            <!-- Search/Filter -->
            <div>
              <input class="form-input w-full" placeholder="Search LoRAs..." v-model="searchTerm" />
              <label class="inline-flex items-center gap-2 mt-2 text-sm">
                <input type="checkbox" v-model="activeOnly" />
                <span>Active Only</span>
              </label>
            </div>

            <!-- Lora list -->
            <div class="space-y-2 max-h-96 overflow-y-auto" data-testid="lora-list">
              <div
                v-for="l in filteredLoras"
                :key="l.id"
                class="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded cursor-pointer"
                :class="{ 'opacity-50': isInComposition(l.id) }"
                @click="addToComposition(l)"
              >
                <div class="min-w-0">
                  <div class="font-medium text-sm truncate">{{ l.name }}</div>
                  <div class="text-xs text-gray-500 truncate">{{ l.description || 'No description' }}</div>
                </div>
                <div class="text-xs text-gray-500" v-if="l.active">Active</div>
              </div>
              <div v-if="!isLoading && filteredLoras.length === 0" class="text-sm text-gray-500">No LoRAs found</div>
              <div v-if="error" class="text-sm text-red-600">Failed to load LoRAs</div>
              <div v-if="isLoading" class="text-sm text-gray-500">Loading…</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Middle: Composition -->
      <div class="lg:col-span-1">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Composition</h3>
          </div>
          <div class="card-body space-y-3" data-testid="composition">
            <div
              v-for="(l, idx) in activeLoras"
              :key="l.id"
              class="border rounded p-3 bg-white"
            >
              <div class="flex items-center gap-2">
                <div class="font-medium flex-1 truncate">{{ l.name }}</div>
                <button class="btn btn-secondary btn-xs" @click="moveUp(idx)" :disabled="idx === 0">↑</button>
                <button class="btn btn-secondary btn-xs" @click="moveDown(idx)" :disabled="idx === activeLoras.length - 1">↓</button>
                <button class="btn btn-secondary btn-xs" @click="removeFromComposition(idx)">✕</button>
              </div>
              <div class="mt-2">
                <label class="text-xs">Weight: {{ l.weight.toFixed(2) }}</label>
                <input type="range" min="0" max="2" step="0.05" v-model.number="l.weight" @input="updateFinal" class="w-full" />
              </div>
            </div>
            <div v-if="activeLoras.length === 0" class="text-sm text-gray-500">No LoRAs in composition</div>
          </div>
        </div>

        <div class="card mt-4">
          <div class="card-header">
            <h3 class="card-title">Quick Actions</h3>
          </div>
          <div class="card-body space-y-2">
            <button class="btn btn-secondary btn-sm w-full" @click="balanceWeights" :disabled="activeLoras.length === 0">Balance All Weights</button>
            <button class="btn btn-secondary btn-sm w-full" @click="duplicateComposition" :disabled="activeLoras.length === 0">Duplicate Composition</button>
          </div>
        </div>
      </div>

      <!-- Right: Prompt and actions -->
      <div class="lg:col-span-1">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Generated Prompt</h3></div>
          <div class="card-body space-y-3">
            <div>
              <label class="form-label">Base Prompt</label>
              <textarea class="form-input h-20" v-model.trim="basePrompt" @input="updateFinal" placeholder="Enter your base prompt"></textarea>
              <p v-if="basePromptError" class="text-xs text-red-600" data-testid="base-error">{{ basePromptError }}</p>
            </div>
            <div>
              <label class="form-label">Negative Prompt</label>
              <textarea class="form-input h-16" v-model.trim="negativePrompt" placeholder="Enter negative prompt"></textarea>
            </div>
            <div>
              <label class="form-label">Complete Prompt</label>
              <textarea class="form-input h-28 font-mono text-xs" readonly :value="finalPrompt"></textarea>
            </div>
            <div class="space-y-2">
              <button class="btn btn-secondary w-full" @click="copyPrompt">Copy Prompt</button>
              <button class="btn btn-secondary w-full" :disabled="activeLoras.length === 0" @click="saveComposition">Save Composition</button>
              <button class="btn btn-primary w-full" :disabled="isGenerating" @click="generateImage">
                <span v-if="!isGenerating">Generate Image</span>
                <span v-else>Generating…</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useApi } from './composables/useApi.js';

const STORAGE_KEY = 'prompt-composer-composition';
const lastSaved = ref(null);

// Loras
const loras = ref([]);
const searchTerm = ref('');
const activeOnly = ref(false);
const { data, error, isLoading, fetchData: loadLoras } = useApi('/api/adapters?per_page=200&page=1', { credentials: 'same-origin' });

// Composition
const activeLoras = ref([]);

// Prompt fields
const basePrompt = ref('');
const negativePrompt = ref('');
const finalPrompt = ref('');
const basePromptError = ref('');
const isGenerating = ref(false);

const filteredLoras = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  let items = loras.value;
  if (activeOnly.value) items = items.filter((i) => i.active);
  if (term) items = items.filter((i) => (i.name || '').toLowerCase().includes(term));
  return items;
});

const isInComposition = (id) => activeLoras.value.some((l) => String(l.id) === String(id));

const addToComposition = (l) => {
  if (isInComposition(l.id)) return;
  activeLoras.value.push({ id: l.id, name: l.name, weight: 1.0 });
  updateFinal();
};

const removeFromComposition = (idx) => {
  activeLoras.value.splice(idx, 1);
  updateFinal();
};

const moveUp = (idx) => {
  if (idx <= 0) return;
  const [item] = activeLoras.value.splice(idx, 1);
  activeLoras.value.splice(idx - 1, 0, item);
  updateFinal();
};

const moveDown = (idx) => {
  if (idx >= activeLoras.value.length - 1) return;
  const [item] = activeLoras.value.splice(idx, 1);
  activeLoras.value.splice(idx + 1, 0, item);
  updateFinal();
>>>>>>> temp/fe-106-migration
};

const balanceWeights = () => {
  if (activeLoras.value.length === 0) return;
<<<<<<< HEAD
  
  const equalWeight = (1.0 / activeLoras.value.length).toFixed(2);
  activeLoras.value.forEach(lora => {
    lora.weight = equalWeight;
  });
  showToastMessage('Weights balanced equally', 'success');
};

// Prompt Generation
const updatePrompt = () => {
  let prompt = basePrompt.value.trim();
  
  if (activeLoras.value.length > 0) {
    const loraPrompts = activeLoras.value.map(lora => {
      const weight = parseFloat(lora.weight);
      if (weight === 1.0) {
        return `<lora:${lora.name}>`;
      } else {
        return `<lora:${lora.name}:${weight}>`;
      }
    });
    
    if (prompt) {
      prompt += ', ' + loraPrompts.join(', ');
    } else {
      prompt = loraPrompts.join(', ');
    }
  }
  
  finalPrompt.value = prompt;
  updateValidation();
};

// Actions
const copyPrompt = async () => {
  if (!finalPrompt.value) return;
  
  try {
    await navigator.clipboard.writeText(finalPrompt.value);
    showToastMessage('Prompt copied to clipboard', 'success');
  } catch (error) {
    console.error('Failed to copy prompt:', error);
    showToastMessage('Failed to copy prompt', 'error');
  }
};

const saveComposition = async () => {
  if (activeLoras.value.length === 0) {
    showToastMessage('No LoRAs to save', 'warning');
    return;
  }
  
  const composition = {
    name: prompt('Enter a name for this composition:'),
    basePrompt: basePrompt.value,
    negativePrompt: negativePrompt.value,
    loras: activeLoras.value.map(lora => ({
      id: lora.id,
      name: lora.name,
      weight: parseFloat(lora.weight),
      order: lora.order
    })),
    createdAt: new Date().toISOString()
  };
  
  if (!composition.name) return;
  
  try {
    // Save to localStorage for now (could be enhanced to save to backend)
    const savedCompositions = JSON.parse(localStorage.getItem('loraCompositions') || '[]');
    savedCompositions.push(composition);
    localStorage.setItem('loraCompositions', JSON.stringify(savedCompositions));
    
    showToastMessage(`Composition "${composition.name}" saved`, 'success');
  } catch (error) {
    console.error('Failed to save composition:', error);
    showToastMessage('Failed to save composition', 'error');
  }
};

const loadComposition = async () => {
  try {
    const savedCompositions = JSON.parse(localStorage.getItem('loraCompositions') || '[]');
    if (savedCompositions.length === 0) {
      showToastMessage('No saved compositions found', 'warning');
      return;
    }
    
    // For now, just load the most recent composition
    // TODO: Implement a proper composition selection dialog
    const latest = savedCompositions[savedCompositions.length - 1];
    
    basePrompt.value = latest.basePrompt || '';
    negativePrompt.value = latest.negativePrompt || '';
    
    // Load LoRAs back into composition
    activeLoras.value = [];
    for (const loraData of latest.loras) {
      const lora = availableLoras.value.find(l => l.id === loraData.id);
      if (lora) {
        activeLoras.value.push({
          ...lora,
          weight: loraData.weight,
          order: loraData.order
        });
      }
    }
    
    // Sort by order
    activeLoras.value.sort((a, b) => a.order - b.order);
    
    showToastMessage(`Loaded composition "${latest.name}"`, 'success');
  } catch (error) {
    console.error('Failed to load composition:', error);
    showToastMessage('Failed to load composition', 'error');
  }
};

const generateImage = async () => {
  if (!finalPrompt.value) {
    showToastMessage('No prompt to generate', 'warning');
    return;
  }
  
  if (!validation.value.isValid) {
    showToastMessage('Please fix validation errors first', 'error');
    return;
  }
  
  isGenerating.value = true;
  
  try {
    const generationParams = {
      prompt: finalPrompt.value,
      negative_prompt: negativePrompt.value || '',
      width: 512,
      height: 512,
      steps: 20,
      cfg_scale: 7.0,
      seed: -1,
      batch_count: 1,
      batch_size: 1
    };
    
    const response = await fetch((window?.BACKEND_URL || '') + '/generation/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(generationParams)
    });
    
    if (response.ok) {
      const result = await response.json();
      showToastMessage('Generation started successfully', 'success');
      
      // Redirect to generation monitoring page or show progress
      if (result.job_id) {
        window.location.href = `/generate?job_id=${result.job_id}`;
      }
    } else {
      const error = await response.text();
      console.error('Generation failed:', error);
      showToastMessage('Generation failed', 'error');
    }
  } catch (error) {
    console.error('Error starting generation:', error);
    showToastMessage('Error starting generation', 'error');
  } finally {
=======
  const w = 1.0;
  activeLoras.value.forEach((l) => (l.weight = w));
  updateFinal();
};

const duplicateComposition = () => {
  activeLoras.value = activeLoras.value.map((l) => ({ ...l }));
  updateFinal();
};

const buildFinalPrompt = () => {
  const base = basePrompt.value.trim();
  if (!base) return '';
  const parts = [base];
  activeLoras.value.forEach((l) => {
    const w = Number(l.weight ?? 1)
      .toFixed(2)
      .replace(/\.00$/, '.0') // 1.00 -> 1.0
      .replace(/0$/, ''); // 1.50 -> 1.5
    parts.push(`<lora:${l.name}:${w}>`);
  });
  if (negativePrompt.value.trim()) {
    parts.push(` --neg ${negativePrompt.value.trim()}`);
  }
  return parts.join(' ');
};

const validate = () => {
  basePromptError.value = '';
  if (!basePrompt.value.trim()) {
    basePromptError.value = 'Base prompt is required';
    return false;
  }
  if (basePrompt.value.length > 1000) {
    basePromptError.value = 'Base prompt is too long';
    return false;
  }
  return true;
};

const updateFinal = () => {
  finalPrompt.value = buildFinalPrompt();
};

const copyPrompt = async () => {
  try {
    updateFinal();
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(finalPrompt.value || '');
    } else {
      const ta = document.createElement('textarea');
      ta.value = finalPrompt.value || '';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  } catch {}
};

const saveComposition = () => {
  const payload = { items: activeLoras.value, base: basePrompt.value, neg: negativePrompt.value };
  lastSaved.value = payload;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
};

const loadComposition = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const payload = raw ? JSON.parse(raw) : lastSaved.value;
    if (!payload) return;
    activeLoras.value = Array.isArray(payload?.items) ? payload.items.map((l) => ({ id: l.id, name: l.name, weight: Number(l.weight) || 1 })) : [];
    basePrompt.value = payload?.base || '';
    negativePrompt.value = payload?.neg || '';
    updateFinal();
  } catch {}
};

const clearComposition = () => {
  activeLoras.value = [];
  updateFinal();
};

const generateImage = async () => {
  if (!validate()) {
    updateFinal();
    return;
  }
  isGenerating.value = true;
  try {
    const backend = window?.BACKEND_URL || '';
    await fetch(`${backend}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: finalPrompt.value, negative_prompt: negativePrompt.value, loras: activeLoras.value })
    });
  } catch {}
  finally {
>>>>>>> temp/fe-106-migration
    isGenerating.value = false;
  }
};

<<<<<<< HEAD
// Utility Methods
const addRandomLoras = (count = 3) => {
  const available = filteredLoras.value.filter(lora => !isInComposition(lora.id));
  const toAdd = available.slice(0, count);
  
  toAdd.forEach(lora => addToComposition(lora));
  
  if (toAdd.length > 0) {
    showToastMessage(`Added ${toAdd.length} random LoRAs`, 'success');
  } else {
    showToastMessage('No available LoRAs to add', 'warning');
  }
};

const duplicateComposition = () => {
  if (activeLoras.value.length === 0) return;
  
  const duplicated = activeLoras.value.map(lora => ({
    ...lora,
    weight: parseFloat(lora.weight)
  }));
  
  activeLoras.value = [...activeLoras.value, ...duplicated];
  showToastMessage('Composition duplicated', 'success');
};

// Toast Notification System
const showToastMessage = (message, type = 'success') => {
  toastMessage.value = message;
  toastType.value = type;
  showToast.value = true;
  
  setTimeout(() => {
    showToast.value = false;
  }, 3000);
};

// Watchers for reactive updates
watch(basePrompt, updatePrompt);
watch(activeLoras, updatePrompt, { deep: true });
watch(searchTerm, debouncedFilterLoras);
watch(activeOnly, filterLoras);

// Component lifecycle
onMounted(init);
</script>

<style scoped>
/* Add any component-specific styles here if needed */
</style>
=======
onMounted(async () => {
  await loadLoras();
  const payload = data.value;
  const items = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);
  loras.value = items.map((i) => ({ id: i.id, name: i.name, description: i.description, active: i.active ?? true }));
});

// Autosave composition to localStorage for resilience
watch([activeLoras, basePrompt, negativePrompt], () => {
  const payload = { items: activeLoras.value, base: basePrompt.value, neg: negativePrompt.value };
  lastSaved.value = payload;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
}, { deep: true });

</script>
>>>>>>> temp/fe-106-migration
