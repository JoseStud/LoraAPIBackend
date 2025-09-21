<template>
  <div class="lora-card-wrapper" :class="viewMode === 'grid' ? 'lora-card-grid' : 'lora-card-list'">
    
    <div v-if="viewMode === 'grid'" class="lora-card-grid-inner">
      <!-- Selection checkbox for bulk mode -->
      <div v-show="bulkMode" class="lora-card-checkbox-container">
        <input 
          type="checkbox" 
          :checked="isSelected"
          @change="$emit('toggle-selection', lora.id)"
          class="form-checkbox"
        >
      </div>
      
      <!-- LoRA Image/Preview -->
      <div class="lora-card-preview-container">
        <div class="lora-card-preview-aspect">
          <img 
            v-if="lora.preview_image" 
            :src="lora.preview_image" 
            :alt="lora.name"
            class="lora-card-preview-image"
          >
          <div v-else class="lora-card-preview-placeholder">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
            </svg>
          </div>
        </div>
        
        <!-- Status Badge -->
        <div class="lora-card-status-badge-container">
          <span :class="['status-badge', isActive ? 'status-active' : 'status-inactive']">
            {{ isActive ? 'Active' : 'Inactive' }}
          </span>
        </div>
        
        <!-- Quality Score -->
        <div v-if="typeof lora.quality_score === 'number'" class="lora-card-quality-score-container">
          <div class="quality-score-badge">
            <span class="text-white text-xs">⭐ {{ lora.quality_score?.toFixed(1) }}</span>
          </div>
        </div>
      </div>
      
      <!-- Card Content -->
      <div class="lora-card-content">
        <!-- Header -->
        <div class="lora-card-header">
          <h3 class="lora-card-title">
            {{ lora.name }}
          </h3>
          <!-- Quick Actions Dropdown -->
          <div class="relative">
            <button 
              @click="showActions = !showActions" 
              class="lora-card-actions-btn"
              aria-haspopup="menu"
              :aria-expanded="showActions"
              aria-label="Open actions menu"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"></path>
              </svg>
            </button>
            <div 
              v-show="showActions" 
              ref="actionsMenuRef"
              class="lora-card-actions-menu"
              role="menu"
              aria-label="LoRA actions"
            >
              <div class="py-1">
                <a :href="`/loras/${lora.id}`" class="lora-card-menu-item">
                  View Details
                </a>
                <button @click="toggleActive" class="lora-card-menu-item w-full text-left">
                  {{ lora.active ? 'Deactivate' : 'Activate' }}
                </button>
                <button @click="getRecommendations" class="lora-card-menu-item w-full text-left">
                  Find Similar
                </button>
                <button @click="generatePreview" class="lora-card-menu-item w-full text-left">
                  Generate Preview
                </button>
                <div class="lora-card-menu-divider"></div>
                <button @click="deleteLoraHandler" class="lora-card-menu-item-danger w-full text-left">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Version and Type -->
        <div class="lora-card-meta">
          <span v-if="lora.version" class="text-xs text-gray-500">v{{ lora.version }}</span>
          <span v-if="lora.type" class="tag tag-blue">
            {{ lora.type }}
          </span>
        </div>
        
        <!-- Description -->
        <p v-if="lora.description" class="lora-card-description">
          {{ lora.description }}
        </p>
        
        <!-- Tags -->
        <div v-if="(lora.tags?.length ?? 0) > 0" class="lora-card-tags">
          <span v-for="tag in (lora.tags ?? []).slice(0, 3)" :key="tag" class="tag">
            {{ tag }}
          </span>
          <span v-if="(lora.tags?.length ?? 0) > 3" class="text-xs text-gray-500">
            +{{ (lora.tags?.length ?? 0) - 3 }} more
          </span>
        </div>
        
        <!-- Weight Control -->
        <div v-if="isActive" class="lora-card-weight-control">
          <label class="form-label text-xs">Weight</label>
          <input 
            type="range" 
            v-model.number="weight" 
            @input="updateWeight"
            min="0" max="2" step="0.1" 
            class="form-range w-full"
          >
          <div class="flex justify-between text-xs text-gray-500">
            <span>0</span>
            <span class="font-medium">{{ weight }}</span>
            <span>2.0</span>
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="lora-card-actions">
          <button 
            @click="toggleActive" 
            :class="lora.active ? 'btn-secondary' : 'btn-primary'"
            class="btn flex-1"
          >
            {{ lora.active ? 'Deactivate' : 'Activate' }}
          </button>
          <button @click="getRecommendations" class="btn btn-secondary px-3">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M13 10V3L4 14h7v7l9-11h-7z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- List View -->
    <div v-else class="lora-card-list-inner">
      <div class="p-4">
        <div class="flex items-center space-x-4">
          <!-- Selection checkbox for bulk mode -->
          <div v-show="bulkMode">
            <input 
              type="checkbox" 
              :checked="isSelected"
              @change="$emit('toggle-selection', lora.id)"
              class="form-checkbox"
            >
          </div>
          
          <!-- Thumbnail -->
          <div class="flex-shrink-0">
            <div class="lora-card-list-thumbnail">
              <img 
                v-if="lora.preview_image" 
                :src="lora.preview_image" 
                :alt="lora.name"
                class="w-full h-full object-cover"
              >
              <div v-else class="lora-card-preview-placeholder">
                <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                </svg>
              </div>
            </div>
          </div>
          
          <!-- Content -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-3">
                <h3 class="lora-card-title text-sm">
                  {{ lora.name }}
                </h3>
                <span v-if="lora.version" class="text-xs text-gray-500">v{{ lora.version }}</span>
                <span :class="['status-badge', lora.active ? 'status-active' : 'status-inactive']">
                  {{ lora.active ? 'Active' : 'Inactive' }}
                </span>
              </div>
              
              <!-- Weight Control (if active) -->
              <div v-if="isActive" class="flex items-center space-x-3">
                <div class="flex items-center space-x-2">
                  <span class="text-xs text-gray-600">Weight:</span>
                  <input 
                    type="range" 
                    v-model.number="weight" 
                    @input="updateWeight"
                    min="0" max="2" step="0.1" 
                    class="w-20"
                  >
                  <span class="text-xs font-medium w-8">{{ weight }}</span>
                </div>
              </div>
            </div>
            
            <!-- Description and Tags -->
            <div class="mt-1 flex items-center space-x-4">
              <p v-if="lora.description" class="lora-card-description text-sm flex-1">
                {{ lora.description }}
              </p>
              
              <div v-if="(lora.tags?.length ?? 0) > 0" class="flex space-x-1">
                <span v-for="tag in (lora.tags ?? []).slice(0, 2)" :key="tag" class="tag">
                  {{ tag }}
                </span>
                <span v-if="(lora.tags?.length ?? 0) > 2" class="text-xs text-gray-500">
                  +{{ (lora.tags?.length ?? 0) - 2 }}
                </span>
              </div>
            </div>
          </div>
          
          <!-- Actions -->
          <div class="flex items-center space-x-2">
            <button 
              @click="toggleActive" 
              :class="lora.active ? 'btn-secondary' : 'btn-primary'"
              class="btn btn-sm"
            >
              {{ lora.active ? 'Deactivate' : 'Activate' }}
            </button>
            <a :href="`/loras/${lora.id}`" class="text-blue-600 hover:text-blue-800 text-sm font-medium">
              View →
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { useSettingsStore } from '@/stores/settings';
import {
  buildRecommendationsUrl,
  deleteLora as deleteLoraRequest,
  triggerPreviewGeneration,
  toggleLoraActiveState,
  updateLoraWeight,
} from '@/services/loraService';
import type {
  LoraGallerySelectionState,
  LoraListItem,
  LoraUpdatePayload,
} from '@/types';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

type WindowWithExtras = Window & {
  htmx?: {
    trigger: (target: Element | Document, event: string, detail?: unknown) => void;
  };
  DevLogger?: {
    error?: (...args: unknown[]) => void;
  };
};

const props = withDefaults(defineProps<{
  lora: LoraListItem;
  viewMode?: LoraGallerySelectionState['viewMode'];
  bulkMode?: boolean;
  isSelected?: boolean;
}>(), {
  viewMode: 'grid',
  bulkMode: false,
  isSelected: false,
});

const emit = defineEmits<{
  'toggle-selection': [string];
  update: [LoraUpdatePayload];
  delete: [string];
}>();

const windowExtras = window as WindowWithExtras;

const settingsStore = useSettingsStore();
const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore);
const apiBaseUrl = computed(() => configuredBackendUrl.value || '/api/v1');

// Local state
const showActions = ref(false);
const actionsMenuRef = ref<HTMLDivElement | null>(null);
const weight = ref<number>(props.lora.weight ?? 1.0);
const isActive = ref<boolean>(Boolean(props.lora.active));

const showNotification = (message: string, type: NotificationType = 'info') => {
  if (windowExtras.htmx) {
    windowExtras.htmx.trigger(document.body, 'show-notification', {
      detail: { message, type },
    });
  }
};

// Watch for prop changes to sync local state
watch(
  () => props.lora.active,
  (newActive) => {
    isActive.value = Boolean(newActive);
  },
);

watch(
  () => props.lora.weight,
  (newWeight) => {
    if (typeof newWeight === 'number') {
      weight.value = newWeight;
    }
  },
);

// Click outside handler
const handleClickOutside = (event: MouseEvent) => {
  const target = event.target;
  if (actionsMenuRef.value && target instanceof Node && !actionsMenuRef.value.contains(target)) {
    showActions.value = false;
  }
};

// Methods
const updateWeight = async () => {
  try {
    const updated = await updateLoraWeight(apiBaseUrl.value, props.lora.id, weight.value);
    const nextWeight = updated?.weight ?? weight.value;
    weight.value = nextWeight;
    emit('update', {
      id: props.lora.id,
      weight: nextWeight,
      type: 'weight',
    });
  } catch (error) {
    windowExtras.DevLogger?.error?.('Failed to update LoRA weight:', error);
    showNotification('Failed to update weight.', 'error');
    weight.value = props.lora.weight ?? weight.value;
  }
};

const toggleActive = async () => {
  try {
    const nextState = !isActive.value;
    await toggleLoraActiveState(apiBaseUrl.value, props.lora.id, nextState);
    isActive.value = nextState;
    emit('update', {
      id: props.lora.id,
      active: nextState,
      type: 'active',
    });
  } catch (error) {
    windowExtras.DevLogger?.error?.('Failed to toggle LoRA active state:', error);
    showNotification('Failed to toggle active state.', 'error');
  }
};

const getRecommendations = () => {
  try {
    const targetUrl = buildRecommendationsUrl(props.lora.id);
    window.location.href = targetUrl;
  } catch (error) {
    windowExtras.DevLogger?.error?.('Error navigating to recommendations:', error);
    showNotification('Unable to open recommendations.', 'error');
  }
};

const generatePreview = async () => {
  try {
    await triggerPreviewGeneration(apiBaseUrl.value, props.lora.id);
    showNotification('Preview generation started.', 'info');
  } catch (error) {
    windowExtras.DevLogger?.error?.('Preview generation not available:', error);
    showNotification('Preview generation not available yet.', 'info');
  }
};

const deleteLoraHandler = async () => {
  if (!confirm(`Are you sure you want to delete "${props.lora.name}"?`)) {
    return;
  }

  try {
    await deleteLoraRequest(apiBaseUrl.value, props.lora.id);
    emit('delete', props.lora.id);
    showNotification('LoRA deleted.', 'success');
  } catch (error) {
    windowExtras.DevLogger?.error?.('Error deleting LoRA:', error);
    showNotification('Error deleting LoRA.', 'error');
  }
};

// Lifecycle
onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>
