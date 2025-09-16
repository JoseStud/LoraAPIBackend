<template>
  <div class="loras-page-container">
    <div v-show="!isInitialized" class="py-12 text-center text-gray-500">
      <svg class="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25"></circle>
        <path d="M4 12a8 8 0 018-8" stroke-width="4" class="opacity-75"></path>
      </svg>
      <div>Loading LoRAs...</div>
    </div>

    <div v-show="isInitialized">
      <!-- Header Section -->
      <div class="loras-page-header">
        <div>
          <h1 class="page-title">LoRA Collection</h1>
          <p class="page-subtitle">Browse and manage your LoRA adapters</p>
        </div>
        <div class="header-actions">
          <button @click="bulkMode = !bulkMode" 
                  :class="bulkMode ? 'btn-warning' : 'btn-secondary'"
                  class="btn btn-sm">
            {{ bulkMode ? 'Exit Bulk' : 'Bulk Actions' }}
          </button>
          <div class="view-mode-toggle">
            <button @click="setViewMode('grid')" 
                    :class="viewMode === 'grid' ? 'active' : ''"
                    class="view-mode-btn">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
              </svg>
            </button>
            <button @click="setViewMode('list')" 
                    :class="viewMode === 'list' ? 'active' : ''"
                    class="view-mode-btn">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- Search and Filters -->
      <div class="card">
        <div class="filters-container">
          <!-- Search Bar -->
          <div class="search-bar-container">
            <input type="text" 
                   v-model="searchTerm" 
                   @input="debounceSearch"
                   placeholder="Search LoRAs by name, description, tags..."
                   class="search-input">
            <div class="search-icon-container">
              <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
            <div v-show="searchTerm" class="clear-search-container">
              <button @click="clearSearch" class="clear-search-btn">
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>
          </div>

          <!-- Filters -->
          <div class="filter-options-container">
            <!-- Status Filter -->
            <div class="filter-group">
              <label class="checkbox-label">
                <input type="checkbox" 
                       v-model="filters.activeOnly" 
                       @change="applyFilters"
                       class="form-checkbox">
                <span class="checkbox-text">Active Only</span>
              </label>
            </div>

            <!-- Tag Filters -->
            <div class="filter-group">
              <span class="filter-label">Tags:</span>
              <div class="tag-filter-group">
                <label v-for="tag in availableTags.slice(0, 5)" :key="tag" class="checkbox-label">
                  <input type="checkbox" 
                         :value="tag"
                         v-model="filters.tags"
                         @change="applyFilters"
                         class="form-checkbox">
                  <span class="checkbox-text">{{ tag }}</span>
                </label>
                <button v-show="availableTags.length > 5" 
                        @click="showAllTags = !showAllTags"
                        class="more-tags-btn">
                  {{ showAllTags ? 'Less' : 'More' }}
                </button>
              </div>
            </div>

            <!-- Sort By -->
            <div class="filter-group">
              <label for="sort-by" class="filter-label">Sort by:</label>
              <select id="sort-by" 
                      v-model="sortBy" 
                      @change="applyFilters"
                      class="form-select">
                <option value="name_asc">Name (A-Z)</option>
                <option value="name_desc">Name (Z-A)</option>
                <option value="created_at_desc">Newest</option>
                <option value="created_at_asc">Oldest</option>
                <option value="last_updated_desc">Recently Updated</option>
              </select>
            </div>

            <div class="ml-auto">
              <button @click="clearFilters" class="btn btn-secondary btn-sm">
                Clear Filters
              </button>
            </div>
          </div>
          
          <!-- All Tags Modal -->
          <div v-show="showAllTags" @click.self="showAllTags = false" class="modal-backdrop">
            <div class="modal-content">
              <h3 class="modal-title">All Tags</h3>
              <div class="all-tags-list">
                <label v-for="tag in availableTags" :key="tag" class="checkbox-label">
                  <input type="checkbox" 
                         :value="tag"
                         v-model="filters.tags"
                         @change="applyFilters"
                         class="form-checkbox">
                  <span class="checkbox-text">{{ tag }}</span>
                </label>
              </div>
              <div class="modal-actions">
                <button @click="showAllTags = false" class="btn btn-primary">Done</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bulk Actions Bar -->
      <Transition name="slide-down">
        <div v-show="bulkMode" class="bulk-actions-bar">
          <div class="flex items-center space-x-4">
            <span class="text-sm font-medium text-gray-700">
              {{ selectedLoras.length }} selected
            </span>
            <button @click="performBulkAction('activate')" 
                    :disabled="selectedLoras.length === 0"
                    class="btn btn-success btn-sm">Activate</button>
            <button @click="performBulkAction('deactivate')" 
                    :disabled="selectedLoras.length === 0"
                    class="btn btn-warning btn-sm">Deactivate</button>
            <button @click="performBulkAction('delete')" 
                    :disabled="selectedLoras.length === 0"
                    class="btn btn-danger btn-sm">Delete</button>
          </div>
          <button @click="toggleSelectAll" class="btn btn-secondary btn-sm">
            {{ allSelected ? 'Deselect All' : 'Select All' }}
          </button>
        </div>
      </Transition>

      <!-- LoRA Gallery Container -->
      <div class="relative">
        <div 
          v-if="isLoading" 
          class="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10"
        >
          <div class="spinner"></div>
        </div>
        
        <div 
          class="lora-gallery-container"
          :class="{ 'opacity-50': isLoading }"
        >
          <LoraCard
            v-for="lora in filteredLoras"
            :key="lora.id"
            :lora="lora"
            :view-mode="viewMode"
            :bulk-mode="bulkMode"
            :is-selected="selectedLoras.includes(lora.id)"
            @toggle-selection="handleSelectionChange"
            @lora-updated="handleLoraUpdate"
            @lora-deleted="handleLoraDelete"
            @lora-error="handleLoraError"
          />
          
          <div v-if="filteredLoras.length === 0 && !isLoading" class="text-center py-12 text-gray-500">
            <svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-6m-6 0H4"></path>
            </svg>
            <h3 class="text-lg font-medium text-gray-900 mb-2">No LoRAs found</h3>
            <p class="text-gray-500">Try adjusting your search or filters.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useApi } from './composables/useApi.js';
import LoraCard from './LoraCard.vue';

// State
const isInitialized = ref(false);
const isLoading = ref(false);
const loras = ref([]);
const selectedLoras = ref([]);
const viewMode = ref('grid');
const bulkMode = ref(false);
const searchTerm = ref('');
const availableTags = ref([]);
const showAllTags = ref(false);

// Filters
const filters = ref({
  activeOnly: false,
  tags: []
});
const sortBy = ref('name_asc');

// Computed
const allSelected = computed(() => {
  return filteredLoras.value.length > 0 && selectedLoras.value.length === filteredLoras.value.length;
});

const filteredLoras = computed(() => {
  let filtered = [...loras.value];
  
  // Apply search
  if (searchTerm.value) {
    const query = searchTerm.value.toLowerCase();
    filtered = filtered.filter(lora => 
      lora.name.toLowerCase().includes(query) ||
      (lora.description && lora.description.toLowerCase().includes(query)) ||
      (lora.tags && lora.tags.some(tag => tag.toLowerCase().includes(query)))
    );
  }
  
  // Apply filters
  if (filters.value.activeOnly) {
    filtered = filtered.filter(lora => lora.active);
  }
  
  if (filters.value.tags.length > 0) {
    filtered = filtered.filter(lora => 
      lora.tags && lora.tags.some(tag => filters.value.tags.includes(tag))
    );
  }
  
  // Apply sorting
  filtered.sort((a, b) => {
    switch (sortBy.value) {
      case 'name_asc':
        return a.name.localeCompare(b.name);
      case 'name_desc':
        return b.name.localeCompare(a.name);
      case 'created_at_desc':
        return new Date(b.created_at) - new Date(a.created_at);
      case 'created_at_asc':
        return new Date(a.created_at) - new Date(b.created_at);
      case 'last_updated_desc':
        return new Date(b.last_updated || b.created_at) - new Date(a.last_updated || a.created_at);
      default:
        return 0;
    }
  });
  
  return filtered;
});

// Methods
const loadLoraData = async () => {
  isLoading.value = true;
  try {
    const url = `${window?.BACKEND_URL || ''}/api/v1/adapters?per_page=100`;
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    loras.value = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : []);
  } catch (error) {
    if (window.DevLogger && window.DevLogger.error) {
      window.DevLogger.error('Error loading LoRA data:', error);
    }
    loras.value = [];
  } finally {
    isLoading.value = false;
  }
};

const fetchAvailableTags = async () => {
  try {
    const url = `${window?.BACKEND_URL || ''}/api/v1/adapters/tags`;
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    availableTags.value = data.tags || [];
  } catch (error) {
    if (window.DevLogger && window.DevLogger.error) {
      window.DevLogger.error('Error fetching tags:', error);
    }
    availableTags.value = [];
  }
};

const setViewMode = (mode) => {
  viewMode.value = mode;
  localStorage.setItem('loraViewMode', mode);
};

const debounceSearch = (() => {
  let timeoutId;
  return () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      // Filters are reactive, so the computed filteredLoras will update automatically
    }, 300);
  };
})();

const clearSearch = () => {
  searchTerm.value = '';
};

const applyFilters = () => {
  // Filters are reactive, so the computed filteredLoras will update automatically
};

const clearFilters = () => {
  searchTerm.value = '';
  filters.value.activeOnly = false;
  filters.value.tags = [];
  sortBy.value = 'name_asc';
};

const handleSelectionChange = (loraId) => {
  const index = selectedLoras.value.indexOf(loraId);
  if (index === -1) {
    selectedLoras.value.push(loraId);
  } else {
    selectedLoras.value.splice(index, 1);
  }
};

const toggleSelectAll = () => {
  if (allSelected.value) {
    selectedLoras.value = [];
  } else {
    selectedLoras.value = filteredLoras.value.map(lora => lora.id);
  }
};

const performBulkAction = async (action) => {
  if (selectedLoras.value.length === 0) {
    if (typeof window.htmx !== 'undefined') {
      window.htmx.trigger(document.body, 'show-notification', {
        detail: { message: 'No LoRAs selected.', type: 'warning' }
      });
    }
    return;
  }

  const confirmMsg = `Are you sure you want to ${action} ${selectedLoras.value.length} LoRA(s)?`;
  if (!confirm(confirmMsg)) {
    return;
  }

  try {
    const url = `${window?.BACKEND_URL || ''}/api/v1/adapters/bulk`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: action,
        lora_ids: selectedLoras.value
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    // Reload data and clear selection
    await loadLoraData();
    selectedLoras.value = [];

    if (typeof window.htmx !== 'undefined') {
      window.htmx.trigger(document.body, 'show-notification', {
        detail: { message: `Successfully ${action}d ${selectedLoras.value.length} LoRA(s).`, type: 'success' }
      });
    }
  } catch (error) {
    if (window.DevLogger && window.DevLogger.error) {
      window.DevLogger.error(`Error performing bulk ${action}:`, error);
    }
    
    if (typeof window.htmx !== 'undefined') {
      window.htmx.trigger(document.body, 'show-notification', {
        detail: { message: `Error performing bulk ${action}.`, type: 'error' }
      });
    }
  }
};

const handleLoraUpdate = (detail) => {
  const { id, type } = detail;
  
  // Find and update the LoRA in our local state
  const lora = loras.value.find(l => l.id === id);
  if (lora) {
    if (type === 'weight' && detail.weight !== undefined) {
      lora.weight = detail.weight;
    } else if (type === 'active' && detail.active !== undefined) {
      lora.active = detail.active;
    }
  }
};

const handleLoraDelete = (detail) => {
  const { id } = detail;
  
  // Remove the LoRA from our local state
  const index = loras.value.findIndex(l => l.id === id);
  if (index !== -1) {
    loras.value.splice(index, 1);
  }
  
  // Remove from selection if present
  const selectionIndex = selectedLoras.value.indexOf(id);
  if (selectionIndex !== -1) {
    selectedLoras.value.splice(selectionIndex, 1);
  }
};

const handleLoraError = (detail) => {
  const { id, error, type } = detail;
  
  if (window.DevLogger && window.DevLogger.error) {
    window.DevLogger.error(`LoRA ${id} error (${type}):`, error);
  }
  
  if (typeof window.htmx !== 'undefined') {
    window.htmx.trigger(document.body, 'show-notification', {
      detail: { message: error, type: 'error' }
    });
  }
};

// Lifecycle
onMounted(async () => {
  // Restore persisted view mode
  const savedViewMode = localStorage.getItem('loraViewMode');
  if (savedViewMode) {
    viewMode.value = savedViewMode;
  }
  
  // Load data
  await Promise.all([
    loadLoraData(),
    fetchAvailableTags()
  ]);
  
  isInitialized.value = true;
});
</script>

<style scoped>
.slide-down-enter-active, .slide-down-leave-active {
  transition: all 0.3s ease;
}
.slide-down-enter-from, .slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>