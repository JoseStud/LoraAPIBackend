<template>
  <Transition name="slide-down">
    <div v-show="bulkMode" class="bulk-actions-bar">
      <div class="flex items-center space-x-4">
        <span class="text-sm font-medium text-gray-700">
          {{ selectedCount }} selected
        </span>
        <button
          class="btn btn-success btn-sm"
          :disabled="selectedCount === 0"
          @click="$emit('perform', 'activate')"
        >
          Activate
        </button>
        <button
          class="btn btn-warning btn-sm"
          :disabled="selectedCount === 0"
          @click="$emit('perform', 'deactivate')"
        >
          Deactivate
        </button>
        <button
          class="btn btn-danger btn-sm"
          :disabled="selectedCount === 0"
          @click="$emit('perform', 'delete')"
        >
          Delete
        </button>
      </div>
      <button class="btn btn-secondary btn-sm" @click="$emit('toggle-select-all')">
        {{ allSelected ? 'Deselect All' : 'Select All' }}
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { LoraBulkAction } from '@/types';

defineOptions({ name: 'LoraGalleryBulkActions' });

defineProps<{
  bulkMode: boolean;
  selectedCount: number;
  allSelected: boolean;
}>();

defineEmits<{
  (event: 'perform', action: LoraBulkAction): void;
  (event: 'toggle-select-all'): void;
}>();
</script>

<style scoped>
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.3s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
