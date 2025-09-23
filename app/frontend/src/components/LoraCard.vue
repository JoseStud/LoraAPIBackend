<template>
  <div class="lora-card-wrapper" :class="viewClass">
    <LoraCardGrid
      v-if="isGridView"
      :card="cardViewModel"
      :bulk-mode="bulkMode"
      :is-selected="isSelected"
      :is-active="isActive"
      :weight="weight"
      @toggle-selection="emit('toggle-selection', $event)"
      @toggle-active="handleToggleActive"
      @recommendations="handleRecommendations"
      @generate-preview="handleGeneratePreview"
      @delete="handleDelete"
      @change-weight="handleWeightChange"
    />
    <LoraCardList
      v-else
      :card="cardViewModel"
      :bulk-mode="bulkMode"
      :is-selected="isSelected"
      :is-active="isActive"
      :weight="weight"
      @toggle-selection="emit('toggle-selection', $event)"
      @toggle-active="handleToggleActive"
      @change-weight="handleWeightChange"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import LoraCardGrid from './LoraCardGrid.vue';
import LoraCardList from './LoraCardList.vue';
import { useLoraCardActions } from '@/composables/useLoraCardActions';
import type { LoraGallerySelectionState, LoraListItem, LoraUpdatePayload } from '@/types';

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
  (e: 'toggle-selection', id: string): void;
  (e: 'update', payload: LoraUpdatePayload): void;
  (e: 'delete', id: string): void;
}>();

const loraRef = toRef(props, 'lora');

const {
  isActive,
  weight,
  detailsUrl,
  qualityScore,
  handleToggleActive,
  handleWeightChange,
  handleRecommendations,
  handleGeneratePreview,
  handleDelete,
} = useLoraCardActions({
  lora: loraRef,
  emitUpdate: (payload) => emit('update', payload),
  emitDelete: (id) => emit('delete', id),
});

const cardViewModel = computed<LoraCardViewModel>(() => ({
  id: loraRef.value.id,
  name: loraRef.value.name,
  version: loraRef.value.version,
  type: loraRef.value.type,
  description: loraRef.value.description,
  previewImage: loraRef.value.preview_image,
  tags: loraRef.value.tags ?? [],
  detailsUrl: detailsUrl.value,
  qualityScore: qualityScore.value,
}));

const isGridView = computed(() => props.viewMode === 'grid');
const viewClass = computed(() => (isGridView.value ? 'lora-card-grid' : 'lora-card-list'));
const bulkMode = computed(() => Boolean(props.bulkMode));
const isSelected = computed(() => Boolean(props.isSelected));
</script>
