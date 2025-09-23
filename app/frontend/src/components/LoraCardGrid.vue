<template>
  <div class="lora-card-grid-inner">
    <div v-show="bulkMode" class="lora-card-checkbox-container">
      <input
        type="checkbox"
        :checked="isSelected"
        @change="emit('toggle-selection', card.id)"
        class="form-checkbox"
      >
    </div>

    <div class="lora-card-preview-container">
      <div class="lora-card-preview-aspect">
        <img
          v-if="card.previewImage"
          :src="card.previewImage"
          :alt="card.name"
          class="lora-card-preview-image"
        >
        <div v-else class="lora-card-preview-placeholder">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
      </div>

      <div class="lora-card-status-badge-container">
        <span :class="['status-badge', isActive ? 'status-active' : 'status-inactive']">
          {{ isActive ? 'Active' : 'Inactive' }}
        </span>
      </div>

      <div v-if="typeof card.qualityScore === 'number'" class="lora-card-quality-score-container">
        <div class="quality-score-badge">
          <span class="text-white text-xs">⭐ {{ card.qualityScore?.toFixed(1) }}</span>
        </div>
      </div>
    </div>

    <div class="lora-card-content">
      <div class="lora-card-header">
        <h3 class="lora-card-title">
          {{ card.name }}
        </h3>
        <div ref="actionsContainerRef" class="relative">
          <button
            @click="toggleActions"
            class="lora-card-actions-btn"
            aria-haspopup="menu"
            :aria-expanded="showActions"
            aria-label="Open actions menu"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          <div
            v-show="showActions"
            class="lora-card-actions-menu"
            role="menu"
            aria-label="LoRA actions"
          >
            <div class="py-1">
              <a :href="card.detailsUrl" class="lora-card-menu-item">
                View Details
              </a>
              <button @click="handleAction('toggle-active')" class="lora-card-menu-item w-full text-left">
                {{ isActive ? 'Deactivate' : 'Activate' }}
              </button>
              <button @click="handleAction('recommendations')" class="lora-card-menu-item w-full text-left">
                Find Similar
              </button>
              <button @click="handleAction('generate-preview')" class="lora-card-menu-item w-full text-left">
                Generate Preview
              </button>
              <div class="lora-card-menu-divider" />
              <button @click="handleAction('delete')" class="lora-card-menu-item-danger w-full text-left">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="lora-card-meta">
        <span v-if="card.version" class="text-xs text-gray-500">v{{ card.version }}</span>
        <span v-if="card.type" class="tag tag-blue">
          {{ card.type }}
        </span>
      </div>

      <p v-if="card.description" class="lora-card-description">
        {{ card.description }}
      </p>

      <div v-if="card.tags.length > 0" class="lora-card-tags">
        <span v-for="tag in card.tags.slice(0, 3)" :key="tag" class="tag">
          {{ tag }}
        </span>
        <span v-if="card.tags.length > 3" class="text-xs text-gray-500">
          +{{ card.tags.length - 3 }} more
        </span>
      </div>

      <div v-if="isActive" class="lora-card-weight-control">
        <label class="form-label text-xs">Weight</label>
        <input
          type="range"
          :value="weight"
          @input="onWeightInput"
          min="0"
          max="2"
          step="0.1"
          class="form-range w-full"
        >
        <div class="flex justify-between text-xs text-gray-500">
          <span>0</span>
          <span class="font-medium">{{ weight }}</span>
          <span>2.0</span>
        </div>
      </div>

      <div class="lora-card-actions">
        <button
          @click="emit('toggle-active')"
          :class="isActive ? 'btn-secondary' : 'btn-primary'"
          class="btn flex-1"
        >
          {{ isActive ? 'Deactivate' : 'Activate' }}
        </button>
        <button @click="emit('recommendations')" class="btn btn-secondary px-3">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';

type LoraCardViewModel = {
  id: string;
  name: string;
  version?: string | null;
  type?: string | null;
  description?: string | null;
  previewImage?: string | null;
  tags: string[];
  detailsUrl: string;
  qualityScore: number | null;
};

const props = defineProps<{
  card: LoraCardViewModel;
  bulkMode: boolean;
  isSelected: boolean;
  isActive: boolean;
  weight: number;
}>();

const emit = defineEmits<{
  (e: 'toggle-selection', id: string): void;
  (e: 'toggle-active'): void;
  (e: 'recommendations'): void;
  (e: 'generate-preview'): void;
  (e: 'delete'): void;
  (e: 'change-weight', value: number): void;
}>();

const showActions = ref(false);
const actionsContainerRef = ref<HTMLDivElement | null>(null);

const toggleActions = () => {
  showActions.value = !showActions.value;
};

const closeActions = () => {
  showActions.value = false;
};

const handleClickOutside = (event: MouseEvent) => {
  const target = event.target;
  if (target instanceof Node && actionsContainerRef.value && !actionsContainerRef.value.contains(target)) {
    closeActions();
  }
};

const onWeightInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  const nextWeight = Number.parseFloat(target.value);
  emit('change-weight', Number.isFinite(nextWeight) ? nextWeight : props.weight);
};

const handleAction = (action: 'toggle-active' | 'recommendations' | 'generate-preview' | 'delete') => {
  closeActions();
  if (action === 'toggle-active') {
    emit('toggle-active');
  } else if (action === 'recommendations') {
    emit('recommendations');
  } else if (action === 'generate-preview') {
    emit('generate-preview');
  } else {
    emit('delete');
  }
};

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>
