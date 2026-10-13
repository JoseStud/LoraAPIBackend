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
      @copy-triggers="handleCopyTriggers"
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
      @copy-triggers="handleCopyTriggers"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import LoraCardGrid from './LoraCardGrid.vue';
import LoraCardList from './LoraCardList.vue';
import { useLoraCardActions } from '../../composables/lora-gallery/useLoraCardActions';
import type { LoraCardViewModel } from './cardViewModel';
import { getLoraLibraryMeta, htmlToPlainText } from '../../utils/libraryMeta';
import { useNotifications } from '@/composables/shared';
import { copyPromptToClipboard } from '@/utils/promptClipboard';
import type { LoraGallerySelectionState, LoraListItem, LoraUpdatePayload } from '@/types';

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

const toggleActive = handleToggleActive;
const updateWeight = (value?: number) => handleWeightChange(value ?? weight.value ?? 1);
const generatePreview = handleGeneratePreview;

const { showSuccess, showError } = useNotifications();

const meta = computed(() => getLoraLibraryMeta(loraRef.value));

const cardViewModel = computed<LoraCardViewModel>(() => ({
  id: loraRef.value.id,
  name: loraRef.value.name,
  version: loraRef.value.version,
  type: loraRef.value.type,
  description: htmlToPlainText(loraRef.value.description) || null,
  previewImage: meta.value.previewImage,
  tags: meta.value.displayTags,
  detailsUrl: detailsUrl.value,
  qualityScore: qualityScore.value,
  archetype: meta.value.archetype,
  series: meta.value.series,
  traits: meta.value.traits,
  triggers: meta.value.triggers,
}));

const handleCopyTriggers = async () => {
  const text = meta.value.triggers.join(', ');
  if (!text) {
    return;
  }
  if (await copyPromptToClipboard(text)) {
    showSuccess('Trigger words copied.', 3000);
  } else {
    showError('Could not copy trigger words.', 5000);
  }
};

const isGridView = computed(() => props.viewMode === 'grid');
const viewClass = computed(() => (isGridView.value ? 'lora-card-grid' : 'lora-card-list'));
const bulkMode = computed(() => Boolean(props.bulkMode));
const isSelected = computed(() => Boolean(props.isSelected));

defineExpose({
  toggleActive,
  updateWeight,
  generatePreview,
});
</script>
