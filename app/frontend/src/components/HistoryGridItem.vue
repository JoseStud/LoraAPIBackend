<template>
  <div class="card card-interactive relative group">
    <div class="absolute top-2 left-2 z-10">
      <input
        type="checkbox"
        class="form-checkbox"
        :checked="isSelected"
        @change="onSelectionChange"
      />
    </div>

    <div class="relative">
      <img
        :src="result.thumbnail_url || result.image_url"
        :alt="result.prompt"
        class="w-full h-48 object-cover rounded-t-lg cursor-pointer"
        @click="$emit('view')"
      />

      <div
        class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100"
      >
        <div class="flex space-x-2">
          <button @click="$emit('view')" class="btn btn-sm btn-primary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
          </button>
          <button @click="$emit('download')" class="btn btn-sm btn-secondary">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="absolute top-2 right-2">
        <div
          v-if="(result.rating ?? 0) > 0"
          class="bg-black bg-opacity-70 text-white px-2 py-1 rounded-full text-xs flex items-center space-x-1"
        >
          <svg class="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
            />
          </svg>
          <span>{{ result.rating ?? 0 }}</span>
        </div>
      </div>
    </div>

    <div class="card-body">
      <div class="text-sm text-gray-900 mb-2 line-clamp-2">{{ result.prompt }}</div>
      <div class="flex items-center justify-between text-xs text-gray-500">
        <span>{{ formattedDate }}</span>
        <span>{{ result.width }}x{{ result.height }}</span>
      </div>

      <div class="flex items-center justify-between mt-3">
        <div class="flex space-x-1">
          <button
            @click="$emit('toggle-favorite')"
            class="text-gray-400 hover:text-red-500"
            :class="{ 'text-red-500': result.is_favorite }"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
          <button @click="$emit('reuse')" class="text-gray-400 hover:text-blue-500">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        <div class="flex space-x-1">
          <button
            v-for="i in 5"
            :key="i"
            @click="emit('rate', i)"
            class="text-gray-300 hover:text-yellow-400"
            :class="{ 'text-yellow-400': i <= (result.rating ?? 0) }"
          >
            <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GenerationHistoryResult } from '@/types';

defineProps<{
  result: GenerationHistoryResult;
  isSelected: boolean;
  formattedDate: string;
}>();

const emit = defineEmits<{
  (e: 'selectionChange', selected: boolean): void;
  (e: 'view'): void;
  (e: 'download'): void;
  (e: 'toggle-favorite'): void;
  (e: 'reuse'): void;
  (e: 'rate', rating: number): void;
}>();

const onSelectionChange = (event: Event): void => {
  emit('selectionChange', (event.target as HTMLInputElement).checked);
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
