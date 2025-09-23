<template>
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
        v-for="lora in loras"
        :key="lora.id"
        :lora="lora"
        :view-mode="viewMode"
        :bulk-mode="bulkMode"
        :is-selected="selectedLoras.includes(lora.id)"
        @toggle-selection="$emit('toggle-selection', lora.id)"
        @update="$emit('update', $event)"
        @delete="$emit('delete', lora.id)"
      />

      <div v-if="loras.length === 0 && !isLoading" class="text-center py-12 text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-6m-6 0H4"></path>
        </svg>
        <h3 class="text-lg font-medium text-gray-900 mb-2">No LoRAs found</h3>
        <p class="text-gray-500">Try adjusting your search or filters.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import LoraCard from './LoraCard.vue';
import type {
  GalleryLora,
  LoraGallerySelectionState,
  LoraUpdatePayload,
} from '@/types';

defineOptions({ name: 'LoraGalleryGrid' });

defineProps<{
  loras: GalleryLora[];
  isLoading: boolean;
  viewMode: LoraGallerySelectionState['viewMode'];
  bulkMode: boolean;
  selectedLoras: string[];
}>();

defineEmits<{
  (event: 'toggle-selection', id: string): void;
  (event: 'update', payload: LoraUpdatePayload): void;
  (event: 'delete', id: string): void;
}>();
</script>
