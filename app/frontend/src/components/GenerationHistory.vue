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
                <div v-show="(result.rating ?? 0) > 0"
                     class="bg-black bg-opacity-70 text-white px-2 py-1 rounded-full text-xs flex items-center space-x-1">
                  <svg class="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"></path>
                  </svg>
                  <span>{{ result.rating ?? 0 }}</span>
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
                          :class="{ 'text-yellow-400': i <= (result.rating ?? 0) }">
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
                          :class="{ 'text-yellow-400': i <= (result.rating ?? 0) }">
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
      <HistoryModal
        :visible="showModal"
        :result="selectedResult"
        :formatted-date="selectedResult ? formatDate(selectedResult.created_at) : ''"
        @close="showModal = false"
        @reuse="handleReuse"
        @download="downloadImage"
        @delete="handleDelete"
      />

      <!-- Toast Notifications -->
      <HistoryToast
        :visible="toastVisible"
        :message="toastMessage"
        :type="toastType"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import HistoryModal from './HistoryModal.vue';
import HistoryToast from './HistoryToast.vue';

import { useGenerationHistory } from '@/composables/useGenerationHistory';
import { downloadFile } from '@/utils/browser';
import { formatFileSize as formatBytes } from '@/utils/format';
import {
  deleteResult as deleteHistoryResult,
  deleteResults as deleteHistoryResults,
  downloadResult as downloadHistoryResult,
  exportResults as exportHistoryResults,
  favoriteResult as favoriteHistoryResult,
  favoriteResults as favoriteHistoryResults,
  rateResult as rateHistoryResult,
} from '@/services/historyService';
import { useBackendBase } from '@/utils/backend';
import type { GenerationHistoryResult } from '@/types';

type ViewMode = 'grid' | 'list';
type ToastType = 'success' | 'error' | 'info' | 'warning';

const viewMode = ref<ViewMode>('grid');
const selectedItems = ref<Array<GenerationHistoryResult['id']>>([]);
const selectedResult = ref<GenerationHistoryResult | null>(null);
const showModal = ref(false);
const isInitialized = ref(false);

const apiBaseUrl = useBackendBase();
const router = useRouter();

const {
  data,
  filteredResults,
  stats,
  isLoading,
  error,
  hasMore,
  searchTerm,
  sortBy,
  dateFilter,
  ratingFilter,
  dimensionFilter,
  loadInitialResults,
  loadMore: loadMoreResults,
  applyFilters,
  debouncedApplyFilters,
  clearFilters,
} = useGenerationHistory({ apiBase: apiBaseUrl });

const toastVisible = ref(false);
const toastMessage = ref('');
const toastType = ref<ToastType>('success');
let toastTimeout: ReturnType<typeof setTimeout> | undefined;

const showToastMessage = (message: string, type: ToastType = 'success'): void => {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  toastMessage.value = message;
  toastType.value = type;
  toastVisible.value = true;

  toastTimeout = setTimeout(() => {
    toastVisible.value = false;
    toastTimeout = undefined;
  }, 3000);
};

watch(error, (value) => {
  if (value) {
    showToastMessage(value, 'error');
  }
});

const showImageModal = (result: GenerationHistoryResult): void => {
  selectedResult.value = result;
  showModal.value = true;
};

const setRating = async (result: GenerationHistoryResult, rating: number): Promise<void> => {
  try {
    await rateHistoryResult(apiBaseUrl.value, result.id, rating);

    result.rating = rating;
    applyFilters();

    showToastMessage('Rating updated successfully');
  } catch (err) {
    console.error('Error updating rating:', err);
    showToastMessage('Failed to update rating', 'error');
  }
};

const toggleFavorite = async (result: GenerationHistoryResult): Promise<void> => {
  try {
    const updatedResult = await favoriteHistoryResult(apiBaseUrl.value, result.id, !result.is_favorite);

    if (updatedResult) {
      result.is_favorite = updatedResult.is_favorite;
    } else {
      result.is_favorite = !result.is_favorite;
    }

    applyFilters();
    showToastMessage(result.is_favorite ? 'Added to favorites' : 'Removed from favorites');
  } catch (err) {
    console.error('Error updating favorite status:', err);
    showToastMessage('Failed to update favorites', 'error');
  }
};

const reuseParameters = (result: GenerationHistoryResult): void => {
  try {
    const parameters = {
      prompt: result.prompt,
      negative_prompt: result.negative_prompt ?? '',
      steps: result.steps,
      cfg_scale: result.cfg_scale,
      width: result.width,
      height: result.height,
      seed: result.seed ?? null,
      sampler: result.sampler ?? result.sampler_name ?? null,
      model: result.model ?? result.model_name ?? null,
      clip_skip: result.clip_skip ?? null,
      loras: result.loras ?? [],
    };

    localStorage.setItem('reuse-parameters', JSON.stringify(parameters));

    showToastMessage('Parameters copied to generation form');
    void router.push({ name: 'compose' });
  } catch (err) {
    console.error('Error saving parameters:', err);
    showToastMessage('Failed to save parameters', 'error');
  }
};
const handleReuse = (result: GenerationHistoryResult): void => {
  reuseParameters(result);
  showModal.value = false;
};



const downloadImage = async (result: GenerationHistoryResult): Promise<void> => {
  try {
    const download = await downloadHistoryResult(apiBaseUrl.value, result.id);
    downloadFile(download.blob, download.filename);

    showToastMessage('Download started');
  } catch (err) {
    console.error('Error downloading image:', err);
    showToastMessage('Failed to download image', 'error');
  }
};

const deleteResult = async (resultId: GenerationHistoryResult['id']): Promise<void> => {
  if (!confirm('Are you sure you want to delete this image?')) {
    return;
  }

  try {
    await deleteHistoryResult(apiBaseUrl.value, resultId);

    data.value = data.value.filter((item) => item.id !== resultId);
    applyFilters();

    showToastMessage('Image deleted successfully');
  } catch (err) {
    console.error('Error deleting result:', err);
    showToastMessage('Failed to delete image', 'error');
  }
};
const handleDelete = async (resultId: GenerationHistoryResult['id']): Promise<void> => {
  await deleteResult(resultId);
  showModal.value = false;
};



const deleteSelected = async (): Promise<void> => {
  if (selectedItems.value.length === 0) {
    return;
  }

  const count = selectedItems.value.length;
  if (!confirm(`Are you sure you want to delete ${count} selected images?`)) {
    return;
  }

  try {
    await deleteHistoryResults(apiBaseUrl.value, { ids: selectedItems.value });

    data.value = data.value.filter((item) => !selectedItems.value.includes(item.id));
    selectedItems.value = [];
    applyFilters();

    showToastMessage(`${count} images deleted successfully`);
  } catch (err) {
    console.error('Error deleting results:', err);
    showToastMessage('Failed to delete images', 'error');
  }
};

const favoriteSelected = async (): Promise<void> => {
  if (selectedItems.value.length === 0) {
    return;
  }

  try {
    await favoriteHistoryResults(apiBaseUrl.value, {
      ids: selectedItems.value,
      is_favorite: true,
    });

    data.value.forEach((result) => {
      if (selectedItems.value.includes(result.id)) {
        result.is_favorite = true;
      }
    });

    applyFilters();
    showToastMessage(`${selectedItems.value.length} images added to favorites`);
  } catch (err) {
    console.error('Error updating favorites:', err);
    showToastMessage('Failed to update favorites', 'error');
  }
};

const exportSelected = async (): Promise<void> => {
  if (selectedItems.value.length === 0) {
    return;
  }

  try {
    const download = await exportHistoryResults(apiBaseUrl.value, { ids: selectedItems.value });
    downloadFile(download.blob, download.filename);

    showToastMessage('Export started');
  } catch (err) {
    console.error('Error exporting results:', err);
    showToastMessage('Failed to export images', 'error');
  }
};

const clearSelection = (): void => {
  selectedItems.value = [];
};

const loadMore = async (): Promise<void> => {
  await loadMoreResults();
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  if (!Number.isFinite(date.getTime())) {
    return '';
  }

  const now = new Date();
  const diffTime = Math.abs(now.getTime() - date.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    return 'Today';
  }
  if (diffDays === 2) {
    return 'Yesterday';
  }
  if (diffDays <= 7) {
    return `${diffDays - 1} days ago`;
  }

  return date.toLocaleDateString();
};

const formatFileSize = (bytes: number) => formatBytes(Number.isFinite(bytes) ? bytes : 0);

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') {
    if (showModal.value) {
      showModal.value = false;
    } else if (selectedItems.value.length > 0) {
      clearSelection();
    }
    return;
  }

  if (event.key === 'Delete' && selectedItems.value.length > 0) {
    deleteSelected();
    return;
  }

  if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    selectedItems.value = filteredResults.value.map((result) => result.id);
  }
};

onMounted(async () => {
  const savedViewMode = localStorage.getItem('history-view-mode');
  if (savedViewMode === 'grid' || savedViewMode === 'list') {
    viewMode.value = savedViewMode;
  }

  document.addEventListener('keydown', handleKeydown);

  await loadInitialResults();
  isInitialized.value = true;
});

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown);
  debouncedApplyFilters.cancel();
  if (toastTimeout) {
    clearTimeout(toastTimeout);
    toastTimeout = undefined;
  }
});

watch(viewMode, (newMode: ViewMode) => {
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