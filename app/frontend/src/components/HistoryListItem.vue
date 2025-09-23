<template>
  <div class="card">
    <div class="card-body">
      <div class="flex items-center space-x-4">
        <input
          type="checkbox"
          class="form-checkbox"
          :checked="isSelected"
          @change="onSelectionChange"
        />

        <img
          :src="result.thumbnail_url || result.image_url"
          :alt="result.prompt"
          class="w-16 h-16 object-cover rounded cursor-pointer"
          @click="$emit('view')"
        />

        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-gray-900 mb-1">{{ result.prompt }}</div>
          <div class="text-xs text-gray-500">
            <span>{{ formattedDate }}</span>
            <span class="mx-1">•</span>
            <span>{{ result.width }}x{{ result.height }}</span>
            <span class="mx-1">•</span>
            <span>{{ result.steps }} steps</span>
            <span class="mx-1">•</span>
            <span>CFG: {{ result.cfg_scale }}</span>
          </div>
        </div>

        <div class="flex space-x-1">
          <button
            v-for="i in 5"
            :key="i"
            @click="emit('rate', i)"
            class="text-gray-300 hover:text-yellow-400"
            :class="{ 'text-yellow-400': i <= (result.rating ?? 0) }"
          >
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
              />
            </svg>
          </button>
        </div>

        <div class="flex space-x-2">
          <button
            @click="$emit('toggle-favorite')"
            class="text-gray-400 hover:text-red-500"
            :class="{ 'text-red-500': result.is_favorite }"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
          <button @click="$emit('reuse')" class="text-gray-400 hover:text-blue-500">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          <button @click="$emit('download')" class="text-gray-400 hover:text-green-500">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
