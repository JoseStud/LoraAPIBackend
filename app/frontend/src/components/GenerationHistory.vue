<template>
  <div class="history-page-container" v-cloak>
    <div v-show="!isInitialized" class="py-12 text-center text-gray-500">
      <svg class="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25"></circle>
        <path d="M4 12a8 8 0 018-8" stroke-width="4" class="opacity-75"></path>
      </svg>
      <div>Loading history...</div>
    </div>

    <div v-show="isInitialized">
      <!-- Page Header -->
      <div class="page-header">
        <div class="flex justify-between items-center">
          <div>
            <h1 class="page-title">Generation History</h1>
            <p class="page-subtitle">View and manage your generated images</p>
          </div>
          <div class="header-actions">
            <div class="flex items-center space-x-3">
              <!-- View Mode Toggle -->
              <div class="view-mode-toggle">
                <button @click="viewMode = 'grid'" 
                        :class="viewMode === 'grid' ? 'view-mode-btn active' : 'view-mode-btn'">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path>
                  </svg>
                </button>
                <button @click="viewMode = 'list'" 
                        :class="viewMode === 'list' ? 'view-mode-btn active' : 'view-mode-btn'">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
                  </svg>
                </button>
              </div>
              
              <!-- Sort Options -->
              <select v-model="sortBy" @change="applyFilters()" class="form-input text-sm">
                <option value="created_at">Newest First</option>
                <option value="created_at_asc">Oldest First</option>
                <option value="prompt">By Prompt</option>
                <option value="rating">By Rating</option>
              </select>
              
              <!-- Actions -->
              <button @click="deleteSelected()" 
                      class="btn btn-danger btn-sm"
                      :disabled="selectedItems.length === 0">
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                </svg>
                Delete ({{ selectedItems.length }})
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Filters and Search -->
      <div class="card mb-6">
        <div class="card-body">
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <!-- Search -->
            <div>
              <label class="form-label">Search Prompts</label>
              <input type="text" 
                     v-model="searchTerm" 
                     @input="debouncedApplyFilters"
                     placeholder="Search prompts..."
                     class="form-input">
            </div>
            
            <!-- Date Range -->
            <div>
              <label class="form-label">Date Range</label>
              <select v-model="dateFilter" @change="applyFilters()" class="form-input">
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="week">Past Week</option>
                <option value="month">Past Month</option>
              </select>
            </div>
            
            <!-- Rating Filter -->
            <div>
              <label class="form-label">Minimum Rating</label>
              <select v-model="ratingFilter" @change="applyFilters()" class="form-input">
                <option value="0">All Ratings</option>
                <option value="1">1+ Stars</option>
                <option value="2">2+ Stars</option>
                <option value="3">3+ Stars</option>
                <option value="4">4+ Stars</option>
                <option value="5">5 Stars Only</option>
              </select>
            </div>
            
            <!-- Dimensions Filter -->
            <div>
              <label class="form-label">Dimensions</label>
              <select v-model="dimensionFilter" @change="applyFilters()" class="form-input">
                <option value="all">All Sizes</option>
                <option value="512x512">512x512</option>
                <option value="768x768">768x768</option>
                <option value="1024x1024">1024x1024</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <!-- Statistics Summary -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold text-blue-600">{{ stats.total_results }}</div>
            <div class="text-sm text-gray-600">Total Images</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold text-green-600">{{ stats.avg_rating.toFixed(1) }}</div>
            <div class="text-sm text-gray-600">Average Rating</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold text-purple-600">{{ stats.total_favorites }}</div>
            <div class="text-sm text-gray-600">Favorited</div>
          </div>
        </div>
        <div class="card">
          <div class="card-body text-center">
            <div class="text-2xl font-bold text-orange-600">{{ formatFileSize(stats.total_size) }}</div>
            <div class="text-sm text-gray-600">Storage Used</div>
          </div>
        </div>
      </div>

      <!-- Results Grid/List -->
      <div class="results-container">
        
        <!-- Bulk Selection Bar -->
        <div v-show="selectedItems.length > 0" 
             class="transition-all duration-300 ease-out opacity-100 transform translate-y-0 bulk-actions-bar mb-4">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-700">
              {{ selectedItems.length }} items selected
            </span>
            <div class="flex space-x-2">
              <button @click="favoriteSelected()" class="btn btn-secondary btn-sm">
                Add to Favorites
              </button>
              <button @click="exportSelected()" class="btn btn-secondary btn-sm">
                Export
              </button>
              <button @click="clearSelection()" class="btn btn-secondary btn-sm">
                Clear
              </button>
            </div>
          </div>
        </div>

        <!-- Grid View -->
        <div v-show="viewMode === 'grid'" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div v-for="result in filteredResults" :key="result.id" class="card card-interactive relative group">
            <!-- Selection Checkbox -->
            <div class="absolute top-2 left-2 z-10">
              <input type="checkbox" 
                     :value="result.id"
                     v-model="selectedItems"
                     class="form-checkbox">
            </div>
            
            <!-- Image -->
            <div class="relative">
              <img :src="result.thumbnail_url || result.image_url" 
                   :alt="result.prompt"
                   class="w-full h-48 object-cover rounded-t-lg cursor-pointer"
                   @click="showImageModal(result)">
              
              <!-- Overlay Actions -->
              <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div class="flex space-x-2">
                  <button @click="showImageModal(result)" 
                          class="btn btn-sm btn-primary">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                    </svg>
                  </button>
                  <button @click="downloadImage(result)" 
                          class="btn btn-sm btn-secondary">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                  </button>
                </div>
              </div>
              
              <!-- Rating Badge -->
              <div class="absolute top-2 right-2">
                <div v-show="result.rating > 0" 
                     class="bg-black bg-opacity-70 text-white px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                  <svg class="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                  </svg>
                  <span>{{ result.rating }}</span>
                </div>
              </div>
            </div>
            
            <!-- Image Info -->
            <div class="card-body">
              <div class="text-sm text-gray-900 mb-2 line-clamp-2">{{ result.prompt }}</div>
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span>{{ formatDate(result.created_at) }}</span>
                <span>{{ result.width }}x{{ result.height }}</span>
              </div>
              
              <!-- Actions -->
              <div class="flex items-center justify-between mt-3">
                <div class="flex space-x-1">
                  <button @click="toggleFavorite(result)" 
                          class="text-gray-400 hover:text-red-500"
                          :class="{ 'text-red-500': result.is_favorite }">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
                    </svg>
                  </button>
                  <button @click="reuseParameters(result)" 
                          class="text-gray-400 hover:text-blue-500">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                  </button>
                </div>
                
                <!-- Star Rating -->
                <div class="flex space-x-1">
                  <button v-for="i in 5" :key="i" 
                          @click="setRating(result, i)" 
                          class="text-gray-300 hover:text-yellow-400"
                          :class="{ 'text-yellow-400': i <= result.rating }">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- List View -->
        <div v-show="viewMode === 'list'" class="space-y-3">
          <div v-for="result in filteredResults" :key="result.id" class="card">
            <div class="card-body">
              <div class="flex items-center space-x-4">
                <!-- Selection -->
                <input type="checkbox" 
                       :value="result.id"
                       v-model="selectedItems"
                       class="form-checkbox">
                
                <!-- Thumbnail -->
                <img :src="result.thumbnail_url || result.image_url" 
                     :alt="result.prompt"
                     class="w-16 h-16 object-cover rounded cursor-pointer"
                     @click="showImageModal(result)">
                
                <!-- Content -->
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-900 mb-1">{{ result.prompt }}</div>
                  <div class="text-xs text-gray-500">
                    <span>{{ formatDate(result.created_at) }}</span> • 
                    <span>{{ result.width }}x{{ result.height }}</span> • 
                    <span>{{ result.steps }} steps</span> • 
                    <span>CFG: {{ result.cfg_scale }}</span>
                  </div>
                </div>
                
                <!-- Rating -->
                <div class="flex space-x-1">
                  <button v-for="i in 5" :key="i" 
                          @click="setRating(result, i)" 
                          class="text-gray-300 hover:text-yellow-400"
                          :class="{ 'text-yellow-400': i <= result.rating }">
                    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                    </svg>
                  </button>
                </div>
                
                <!-- Actions -->
                <div class="flex space-x-2">
                  <button @click="toggleFavorite(result)" 
                          class="text-gray-400 hover:text-red-500"
                          :class="{ 'text-red-500': result.is_favorite }">
                    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clip-rule="evenodd"></path>
                    </svg>
                  </button>
                  <button @click="reuseParameters(result)" 
                          class="text-gray-400 hover:text-blue-500">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                  </button>
                  <button @click="downloadImage(result)" 
                          class="text-gray-400 hover:text-green-500">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-if="filteredResults.length === 0" class="empty-state-container-lg">
          <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          <div class="empty-state-title">No results found</div>
          <div class="empty-state-message">Try adjusting your filters or search terms</div>
          <div class="empty-state-actions">
            <button @click="clearFilters()" class="btn btn-primary">
              Clear Filters
            </button>
          </div>
        </div>
        
        <!-- Load More -->
        <div v-show="hasMore && filteredResults.length > 0" class="text-center mt-6">
          <button @click="loadMore()" 
                  class="btn btn-secondary"
                  :disabled="isLoading">
            <span v-if="!isLoading">Load More Results</span>
            <div v-else class="flex items-center">
              <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
              </svg>
              Loading...
            </div>
          </button>
        </div>
      </div>
      
      <!-- Full-size Image Modal -->
      <div v-show="showModal" 
           class="fixed inset-0 z-50 overflow-y-auto transition-opacity duration-300"
           :class="showModal ? 'opacity-100' : 'opacity-0'">
        <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
          <div class="fixed inset-0 bg-gray-500 bg-opacity-75" @click="showModal = false"></div>
          
          <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
            <div v-if="selectedResult">
              <img :src="selectedResult.image_url" 
                   :alt="selectedResult.prompt"
                   class="w-full max-h-96 object-contain">
              <div class="p-6">
                <div class="flex items-start justify-between mb-4">
                  <div class="flex-1">
                    <h3 class="text-lg font-medium text-gray-900 mb-2">Generation Details</h3>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                      <div><strong>Prompt:</strong> {{ selectedResult.prompt }}</div>
                      <div><strong>Size:</strong> {{ selectedResult.width }}x{{ selectedResult.height }}</div>
                      <div><strong>Steps:</strong> {{ selectedResult.steps }}</div>
                      <div><strong>CFG Scale:</strong> {{ selectedResult.cfg_scale }}</div>
                      <div><strong>Seed:</strong> {{ selectedResult.seed }}</div>
                      <div><strong>Created:</strong> {{ formatDate(selectedResult.created_at) }}</div>
                    </div>
                  </div>
                  <button @click="showModal = false" 
                          class="text-gray-400 hover:text-gray-600">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                  </button>
                </div>
                
                <div class="flex space-x-3">
                  <button @click="reuseParameters(selectedResult); showModal = false" 
                          class="btn btn-primary">
                    Use Parameters
                  </button>
                  <button @click="downloadImage(selectedResult)" 
                          class="btn btn-secondary">
                    Download
                  </button>
                  <button @click="deleteResult(selectedResult.id); showModal = false" 
                          class="btn btn-danger">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Toast Notifications -->
      <div v-show="showToast" 
           class="fixed top-4 right-4 z-50 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-300"
           :class="showToast ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-2'">
        <span>{{ toastMessage }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { useSettingsStore } from '@/stores/settings';

// State mirroring the Alpine.js implementation
const data = ref([]);
const isLoading = ref(false);
const error = ref(null);
const hasMore = ref(true);
const currentPage = ref(1);
const pageSize = ref(50);
const isInitialized = ref(false);

const filteredResults = ref([]);
const selectedItems = ref([]);
const selectedResult = ref(null);

// View state
const viewMode = ref('grid');
const showModal = ref(false);
const showToast = ref(false);
const toastMessage = ref('');

// Filters
const searchTerm = ref('');
const sortBy = ref('created_at');
const dateFilter = ref('all');
const ratingFilter = ref(0);
const dimensionFilter = ref('all');

// Statistics
const stats = reactive({
  total_results: 0,
  avg_rating: 0,
  total_favorites: 0,
  total_size: 0
});

// Runtime configuration
const settingsStore = useSettingsStore();
const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore);
const apiBaseUrl = computed(() => configuredBackendUrl.value || '/api/v1');

// Debounced filter application
let debounceTimeout = null;
const debouncedApplyFilters = () => {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {
    applyFilters();
  }, 300);
};

// Methods - mirrors Alpine.js implementation
const loadResults = async () => {
  isLoading.value = true;
  error.value = null;
  
  try {
    const params = new URLSearchParams({
      page: currentPage.value,
      page_size: pageSize.value
    });
    
    const response = await fetch(`${apiBaseUrl.value}/results?${params}`, {
      credentials: 'same-origin'
    });
    
    if (!response.ok) {
      throw new Error('Failed to load results');
    }
    
    const responseData = await response.json();
    
    if (currentPage.value === 1) {
      data.value = responseData.results || responseData || [];
    } else {
      data.value.push(...(responseData.results || responseData || []));
    }
    
    hasMore.value = responseData.has_more || false;
    applyFilters();
    
  } catch (err) {
    error.value = err.message;
    showToastMessage('Failed to load results', 'error');
  } finally {
    isLoading.value = false;
  }
};

const applyFilters = () => {
  let filtered = [...data.value];
  
  // Search filter
  if (searchTerm.value.trim()) {
    const searchLower = searchTerm.value.toLowerCase();
    filtered = filtered.filter(result => 
      result.prompt.toLowerCase().includes(searchLower) ||
      (result.negative_prompt && result.negative_prompt.toLowerCase().includes(searchLower))
    );
  }
  
  // Date filter
  if (dateFilter.value !== 'all') {
    const now = new Date();
    const filterDate = new Date();
    
    switch (dateFilter.value) {
      case 'today':
        filterDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        filterDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        filterDate.setMonth(now.getMonth() - 1);
        break;
    }
    
    filtered = filtered.filter(result => 
      new Date(result.created_at) >= filterDate
    );
  }
  
  // Rating filter
  if (ratingFilter.value > 0) {
    filtered = filtered.filter(result => 
      (result.rating || 0) >= ratingFilter.value
    );
  }
  
  // Dimension filter
  if (dimensionFilter.value !== 'all') {
    const [width, height] = dimensionFilter.value.split('x').map(Number);
    filtered = filtered.filter(result => 
      result.width === width && result.height === height
    );
  }
  
  // Sort results
  sortResults(filtered);
  
  filteredResults.value = filtered;
  calculateStats();
};

const sortResults = (results) => {
  switch (sortBy.value) {
    case 'created_at':
      results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      break;
    case 'created_at_asc':
      results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      break;
    case 'prompt':
      results.sort((a, b) => a.prompt.localeCompare(b.prompt));
      break;
    case 'rating':
      results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      break;
  }
};

const calculateStats = () => {
  stats.total_results = filteredResults.value.length;
  
  if (filteredResults.value.length > 0) {
    // Average rating
    const totalRating = filteredResults.value.reduce((sum, result) => sum + (result.rating || 0), 0);
    stats.avg_rating = totalRating / filteredResults.value.length;
    
    // Total favorites
    stats.total_favorites = filteredResults.value.filter(result => result.is_favorite).length;
    
    // Total size (mock calculation - would need actual file sizes)
    stats.total_size = filteredResults.value.length * 2.5 * 1024 * 1024; // Assume 2.5MB per image
  } else {
    stats.avg_rating = 0;
    stats.total_favorites = 0;
    stats.total_size = 0;
  }
};

const clearFilters = () => {
  searchTerm.value = '';
  sortBy.value = 'created_at';
  dateFilter.value = 'all';
  ratingFilter.value = 0;
  dimensionFilter.value = 'all';
  applyFilters();
};

const showImageModal = (result) => {
  selectedResult.value = result;
  showModal.value = true;
};

const setRating = async (result, rating) => {
  try {
    const response = await fetch(`${apiBaseUrl.value}/results/${result.id}/rating`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rating })
    });
    
    if (!response.ok) {
      throw new Error('Failed to update rating');
    }
    
    // Update local data
    result.rating = rating;
    calculateStats();
    
    showToastMessage('Rating updated successfully');
    
  } catch (error) {
    console.error('Error updating rating:', error);
    showToastMessage('Failed to update rating', 'error');
  }
};

const toggleFavorite = async (result) => {
  try {
    const response = await fetch(`${apiBaseUrl.value}/results/${result.id}/favorite`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_favorite: !result.is_favorite })
    });
    
    if (!response.ok) {
      throw new Error('Failed to update favorite status');
    }
    
    // Update local data
    result.is_favorite = !result.is_favorite;
    calculateStats();
    
    const message = result.is_favorite ? 'Added to favorites' : 'Removed from favorites';
    showToastMessage(message);
    
  } catch (error) {
    console.error('Error updating favorite:', error);
    showToastMessage('Failed to update favorite status', 'error');
  }
};

const reuseParameters = (result) => {
  // Store parameters in localStorage for the compose page
  const parameters = {
    prompt: result.prompt,
    negative_prompt: result.negative_prompt || '',
    width: result.width,
    height: result.height,
    steps: result.steps,
    cfg_scale: result.cfg_scale,
    seed: result.seed,
    loras: result.loras || []
  };
  
  localStorage.setItem('reuse-parameters', JSON.stringify(parameters));
  
  // Navigate to compose page
  window.location.href = '/compose';
};

const downloadImage = async (result) => {
  try {
    const response = await fetch(result.image_url);
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generation-${result.id}.png`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    showToastMessage('Download started');
    
  } catch (error) {
    console.error('Error downloading image:', error);
    showToastMessage('Failed to download image', 'error');
  }
};

const deleteResult = async (resultId) => {
  if (!confirm('Are you sure you want to delete this image?')) {
    return;
  }
  
  try {
    const response = await fetch(`${apiBaseUrl.value}/results/${resultId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete result');
    }
    
    // Remove from local data
    data.value = data.value.filter(r => r.id !== resultId);
    applyFilters();
    
    showToastMessage('Image deleted successfully');
    
  } catch (error) {
    console.error('Error deleting result:', error);
    showToastMessage('Failed to delete image', 'error');
  }
};

const deleteSelected = async () => {
  if (selectedItems.value.length === 0) return;
  
  const count = selectedItems.value.length;
  if (!confirm(`Are you sure you want to delete ${count} selected images?`)) {
    return;
  }
  
  try {
    const response = await fetch(`${apiBaseUrl.value}/results/bulk-delete`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: selectedItems.value })
    });
    
    if (!response.ok) {
      throw new Error('Failed to delete results');
    }
    
    // Remove from local data
    data.value = data.value.filter(r => !selectedItems.value.includes(r.id));
    selectedItems.value = [];
    applyFilters();
    
    showToastMessage(`${count} images deleted successfully`);
    
  } catch (error) {
    console.error('Error deleting results:', error);
    showToastMessage('Failed to delete images', 'error');
  }
};

const favoriteSelected = async () => {
  if (selectedItems.value.length === 0) return;
  
  try {
    const response = await fetch(`${apiBaseUrl.value}/results/bulk-favorite`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        ids: selectedItems.value,
        is_favorite: true 
      })
    });
    
    if (!response.ok) {
      throw new Error('Failed to update favorites');
    }
    
    // Update local data
    data.value.forEach(result => {
      if (selectedItems.value.includes(result.id)) {
        result.is_favorite = true;
      }
    });
    
    calculateStats();
    showToastMessage(`${selectedItems.value.length} images added to favorites`);
    
  } catch (error) {
    console.error('Error updating favorites:', error);
    showToastMessage('Failed to update favorites', 'error');
  }
};

const exportSelected = async () => {
  if (selectedItems.value.length === 0) return;
  
  try {
    const response = await fetch(`${apiBaseUrl.value}/results/export`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: selectedItems.value })
    });
    
    if (!response.ok) {
      throw new Error('Failed to export results');
    }
    
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generation-export-${Date.now()}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    showToastMessage('Export started');
    
  } catch (error) {
    console.error('Error exporting results:', error);
    showToastMessage('Failed to export images', 'error');
  }
};

const clearSelection = () => {
  selectedItems.value = [];
};

const loadMore = async () => {
  if (!hasMore.value || isLoading.value) return;
  
  currentPage.value++;
  await loadResults();
};

const formatDate = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffTime = Math.abs(now - date);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 1) {
    return 'Today';
  } else if (diffDays === 2) {
    return 'Yesterday';
  } else if (diffDays <= 7) {
    return `${diffDays - 1} days ago`;
  } else {
    return date.toLocaleDateString();
  }
};

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const showToastMessage = (message, type = 'success') => {
  toastMessage.value = message;
  showToast.value = true;
  
  setTimeout(() => {
    showToast.value = false;
  }, 3000);
};

// Handle keyboard shortcuts
const handleKeydown = (event) => {
  if (event.key === 'Escape') {
    if (showModal.value) {
      showModal.value = false;
    } else if (selectedItems.value.length > 0) {
      clearSelection();
    }
  } else if (event.key === 'Delete' && selectedItems.value.length > 0) {
    deleteSelected();
  } else if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    selectedItems.value = filteredResults.value.map(r => r.id);
  }
};

// Initialize component
onMounted(async () => {
  // Load view mode preference
  const savedViewMode = localStorage.getItem('history-view-mode');
  if (savedViewMode) {
    viewMode.value = savedViewMode;
  }
  
  // Add keyboard event listener
  document.addEventListener('keydown', handleKeydown);
  
  // Start fetching data
  await loadResults();
  isInitialized.value = true;
});

onUnmounted(() => {
  // Clean up event listener
  document.removeEventListener('keydown', handleKeydown);
  
  // Clear any pending debounce
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
  }
});

// Watch for view mode changes and save preference
watch(viewMode, (newMode) => {
  localStorage.setItem('history-view-mode', newMode);
});
</script>

<style scoped>
[v-cloak] {
  display: none;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>