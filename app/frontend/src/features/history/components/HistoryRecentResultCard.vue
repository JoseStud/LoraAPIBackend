<template>
  <div class="border border-gray-200 rounded-lg overflow-hidden" :class="{ 'pointer-events-none opacity-80': loading }">
    <div v-if="loading" class="animate-pulse">
      <div class="w-full h-32 bg-gray-200" />
      <div class="p-3 space-y-3">
        <div class="h-4 bg-gray-200 rounded" />
        <div class="flex items-center justify-between">
          <div class="h-3 w-24 bg-gray-200 rounded" />
          <div class="flex space-x-2">
            <div class="h-3 w-12 bg-gray-200 rounded" />
            <div class="h-3 w-12 bg-gray-200 rounded" />
          </div>
        </div>
      </div>
    </div>
    <template v-else-if="result">
      <button class="block w-full" type="button" @click="handleView">
        <img
          v-if="result.image_url"
          :src="result.image_url"
          :alt="result.prompt ?? 'Generated image'"
          class="w-full h-32 object-cover"
        >
        <div v-else class="w-full h-32 bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
          No preview available
        </div>
      </button>
      <div class="p-3 space-y-2">
        <div class="text-sm text-gray-900 line-clamp-2">
          {{ result.prompt ?? 'Untitled Generation' }}
        </div>
        <div class="flex items-center justify-between text-xs text-gray-500">
          <span>{{ formattedDate }}</span>
          <div class="flex space-x-2">
            <button class="text-blue-500 hover:text-blue-700" type="button" @click="handleReuse">
              Reuse
            </button>
            <button class="text-red-500 hover:text-red-700" type="button" @click="handleDelete">
              Delete
            </button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { GenerationHistoryResult } from '@/types';

const props = withDefaults(
  defineProps<{
    result?: GenerationHistoryResult | null;
    formattedDate?: string;
    loading?: boolean;
  }>(),
  {
    result: null,
    formattedDate: '',
    loading: false,
  },
);

const emit = defineEmits<{
  (event: 'view'): void;
  (event: 'reuse'): void;
  (event: 'delete'): void;
}>();

const canInteract = computed(() => !props.loading && !!props.result);

const handleView = (): void => {
  if (!canInteract.value) {
    return;
  }

  emit('view');
};

const handleReuse = (): void => {
  if (!canInteract.value) {
    return;
  }

  emit('reuse');
};

const handleDelete = (): void => {
  if (!canInteract.value) {
    return;
  }

  emit('delete');
};
</script>

<style scoped>
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
