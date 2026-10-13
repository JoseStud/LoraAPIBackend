<template>
  <div class="lora-card-list-inner">
    <div class="p-4">
      <div class="flex items-center space-x-4">
        <div v-show="bulkMode">
          <input
            type="checkbox"
            :checked="isSelected"
            @change="emit('toggle-selection', card.id)"
            class="form-checkbox"
          >
        </div>

        <div class="flex-shrink-0">
          <div class="lora-card-list-thumbnail">
            <img
              v-if="card.previewImage"
              :src="card.previewImage"
              :alt="card.name"
              class="w-full h-full object-cover object-top"
              loading="lazy"
              referrerpolicy="no-referrer"
            >
            <div v-else class="lora-card-preview-placeholder">
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
          </div>
        </div>

        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3">
              <h3 class="lora-card-title text-sm">
                {{ card.name }}
              </h3>
              <span v-if="card.version" class="text-xs text-gray-500">{{ /^\d/.test(card.version) ? `v${card.version}` : card.version }}</span>
              <span
                v-if="card.archetype"
                class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
                data-testid="lora-card-archetype"
              >
                {{ formatArchetypeLabel(card.archetype) }}
              </span>
              <span v-if="card.series" class="text-xs text-gray-500">{{ card.series }}</span>
              <span :class="['status-badge', isActive ? 'status-active' : 'status-inactive']">
                {{ isActive ? 'Active' : 'Inactive' }}
              </span>
            </div>

            <div v-if="isActive" class="flex items-center space-x-3">
              <div class="flex items-center space-x-2">
                <span class="text-xs text-gray-600">Weight:</span>
                <input
                  type="range"
                  :value="weight"
                  @input="onWeightInput"
                  min="0"
                  max="2"
                  step="0.1"
                  class="w-20"
                >
                <span class="text-xs font-medium w-8">{{ weight }}</span>
              </div>
            </div>
          </div>

          <div class="mt-1 flex items-center space-x-4">
            <p v-if="card.description" class="lora-card-description text-sm flex-1 truncate" :title="card.description">
              {{ card.description }}
            </p>

            <button
              v-if="card.triggers.length > 0"
              type="button"
              class="max-w-xs truncate rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-700 hover:bg-gray-200"
              :title="`Copy: ${card.triggers.join(', ')}`"
              aria-label="Copy trigger words"
              @click="emit('copy-triggers')"
            >
              {{ card.triggers.join(', ') }}
            </button>

            <div v-if="card.tags.length > 0" class="flex space-x-1">
              <span v-for="tag in card.tags.slice(0, 2)" :key="tag" class="tag">
                {{ tag }}
              </span>
              <span v-if="card.tags.length > 2" class="text-xs text-gray-500">
                +{{ card.tags.length - 2 }}
              </span>
            </div>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <button
            @click="emit('toggle-active')"
            :class="isActive ? 'btn-secondary' : 'btn-primary'"
            class="btn btn-sm"
          >
            {{ isActive ? 'Deactivate' : 'Activate' }}
          </button>
          <a :href="card.detailsUrl" class="text-blue-600 hover:text-blue-800 text-sm font-medium">
            View →
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LoraCardViewModel } from './cardViewModel';
import { formatArchetypeLabel } from '../../utils/libraryMeta';

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
  (e: 'change-weight', value: number): void;
  (e: 'copy-triggers'): void;
}>();

const onWeightInput = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  if (!target) return;
  const nextWeight = Number.parseFloat(target.value);
  emit('change-weight', Number.isFinite(nextWeight) ? nextWeight : props.weight);
};
</script>
