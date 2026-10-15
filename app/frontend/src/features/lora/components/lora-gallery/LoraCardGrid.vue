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
      <component
        :is="bulkMode ? 'div' : 'a'"
        class="lora-card-preview-aspect"
        :href="bulkMode ? undefined : card.detailsUrl"
        :aria-label="bulkMode ? undefined : `View details for ${card.name}`"
        data-testid="lora-card-preview-link"
        @click="onDetailsClick"
      >
        <img
          v-if="card.previewImage"
          :src="card.previewImage"
          :alt="card.name"
          class="lora-card-preview-image"
          loading="lazy"
          referrerpolicy="no-referrer"
        >
        <div v-else class="lora-card-preview-placeholder">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
      </component>

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
          <a
            :href="card.detailsUrl"
            class="lora-card-title-link"
            data-testid="lora-card-title-link"
            @click="onDetailsClick"
          >{{ card.name }}</a>
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
              <a :href="card.detailsUrl" class="lora-card-menu-item" @click="onDetailsClick">
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
        <span v-if="card.version" class="text-xs text-gray-500">{{ versionLabel }}</span>
        <span v-if="card.type" class="tag tag-blue">
          {{ card.type }}
        </span>
      </div>

      <div v-if="card.archetype || card.series" class="lora-card-library" data-testid="lora-card-library">
        <span v-if="card.archetype" class="lora-chip lora-chip-archetype" :title="traitSummary">
          {{ formatArchetypeLabel(card.archetype) }}
        </span>
        <span v-if="card.series" class="lora-chip lora-chip-series">
          {{ card.series }}
        </span>
      </div>

      <p v-if="card.description" class="lora-card-description" :title="card.description">
        {{ card.description }}
      </p>

      <div v-if="card.triggers.length > 0" class="lora-card-triggers" data-testid="lora-card-triggers">
        <code class="lora-card-trigger-text" :title="triggerText">{{ triggerText }}</code>
        <button
          type="button"
          class="lora-card-copy-btn"
          aria-label="Copy trigger words"
          title="Copy trigger words"
          @click="emit('copy-triggers')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>
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
import { computed, onMounted, onUnmounted, ref } from 'vue';

import type { LoraCardViewModel } from './cardViewModel';
import { isPlainLeftClick } from '../../utils/links';
import { formatArchetypeLabel, TRAIT_KEYS } from '../../utils/libraryMeta';

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
  (e: 'copy-triggers'): void;
  (e: 'open-details'): void;
}>();

const triggerText = computed(() => props.card.triggers.join(', '));
// Prefix bare numbers ("1.0" -> "v1.0"); keep names like "v2" or "ilxl-v0.1".
const versionLabel = computed(() =>
  props.card.version && /^\d/.test(props.card.version) ? `v${props.card.version}` : props.card.version,
);
const traitSummary = computed(() =>
  TRAIT_KEYS.filter((key) => props.card.traits[key])
    .map((key) => `${key}: ${props.card.traits[key]}`)
    .join(' · '),
);

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

const onDetailsClick = (event: MouseEvent) => {
  // The preview is a plain container in bulk mode, not a link.
  if (!(event.currentTarget instanceof HTMLAnchorElement)) {
    return;
  }
  closeActions();
  if (isPlainLeftClick(event)) {
    event.preventDefault();
    emit('open-details');
  }
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

<style scoped>
.lora-card-grid-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: 0.75rem;
  border: 1px solid var(--color-secondary-200);
  background: var(--color-bg-primary, #fff);
}

.lora-card-preview-container {
  position: relative;
  flex-shrink: 0;
}

.lora-card-preview-aspect {
  display: block;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  border-radius: 0.75rem 0.75rem 0 0;
  background: var(--color-secondary-100);
}

.lora-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-width: 0;
}

.lora-card-actions-menu {
  position: absolute;
  right: 0;
  z-index: 20;
  min-width: 11rem;
  border: 1px solid var(--color-secondary-200);
  border-radius: 0.5rem;
  background: var(--color-bg-primary, #fff);
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.12);
}

.lora-card-menu-item,
.lora-card-menu-item-danger {
  display: block;
  padding: 0.5rem 0.875rem;
  font-size: 0.875rem;
}

.lora-card-menu-item:hover {
  background: var(--color-secondary-100);
}

.lora-card-menu-item-danger {
  color: var(--color-error-600);
}

.lora-card-menu-item-danger:hover {
  background: var(--color-error-50);
}

.lora-card-menu-divider {
  margin: 0.25rem 0;
  border-top: 1px solid var(--color-secondary-200);
}

.lora-card-preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top;
}

.lora-card-preview-placeholder {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
}

.lora-card-status-badge-container {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
}

.lora-card-content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.5rem;
  min-height: 0;
  padding: 0.75rem 1rem 1rem;
}

.lora-card-title {
  overflow: hidden;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lora-card-title-link {
  color: inherit;
}

.lora-card-title-link:hover,
.lora-card-title-link:focus-visible {
  color: var(--color-primary-700);
  text-decoration: underline;
}

.lora-card-library {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.lora-chip {
  max-width: 100%;
  overflow: hidden;
  border-radius: 9999px;
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lora-chip-archetype {
  background: var(--color-primary-100);
  color: var(--color-primary-800);
}

.lora-chip-series {
  background: var(--color-secondary-100);
  color: var(--color-secondary-700);
}

.lora-card-description {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-secondary-600);
  font-size: 0.8125rem;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.lora-card-triggers {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  border-radius: 0.375rem;
  background: var(--color-secondary-50);
  padding: 0.25rem 0.25rem 0.25rem 0.5rem;
}

.lora-card-trigger-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--color-secondary-800);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lora-card-copy-btn {
  flex-shrink: 0;
  border-radius: 0.25rem;
  padding: 0.25rem;
  color: var(--color-secondary-500);
}

.lora-card-copy-btn:hover,
.lora-card-copy-btn:focus-visible {
  background: var(--color-secondary-200);
  color: var(--color-secondary-900);
}

.lora-card-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: auto;
}

.status-badge {
  border-radius: 9999px;
  padding: 0.125rem 0.5rem;
  font-size: 0.6875rem;
  font-weight: 600;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
}

.status-active {
  background: var(--color-success-500);
  color: #fff;
}

.status-inactive {
  background: rgba(15, 23, 42, 0.7);
  color: #fff;
}
</style>
