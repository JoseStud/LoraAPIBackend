<template>
  <div v-if="visible" class="fixed inset-0 z-50 overflow-y-auto transition-opacity duration-300 opacity-100">
    <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75" @click="handleClose"></div>

      <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full" @click.stop>
        <div v-if="result">
          <img :src="result.image_url ?? ''"
               :alt="result.prompt ?? 'Generated image'"
               class="w-full max-h-96 object-contain">
          <div class="p-6">
            <div class="flex items-start justify-between mb-4">
              <div class="flex-1">
                <h3 class="text-lg font-medium text-gray-900 mb-2">Generation Details</h3>
                <div class="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>Prompt:</strong> {{ result.prompt ?? 'Untitled generation' }}</div>
                  <div><strong>Size:</strong> {{ result.width }}x{{ result.height }}</div>
                  <div><strong>Steps:</strong> {{ result.steps }}</div>
                  <div><strong>CFG Scale:</strong> {{ result.cfg_scale }}</div>
                  <div><strong>Seed:</strong> {{ result.seed }}</div>
                  <div><strong>Created:</strong> {{ formattedDate }}</div>
                </div>
              </div>
              <button @click="handleClose" class="text-gray-400 hover:text-gray-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              </button>
            </div>

            <div class="flex space-x-3">
              <button @click="handleReuse" class="btn btn-primary">
                Use Parameters
              </button>
              <button @click="handleDownload" class="btn btn-secondary">
                Download
              </button>
              <button @click="handleDelete" class="btn btn-danger">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GenerationHistoryResult } from '@/types';

const props = defineProps<{
  visible: boolean;
  result: GenerationHistoryResult | null;
  formattedDate?: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'reuse', result: GenerationHistoryResult): void;
  (event: 'download', result: GenerationHistoryResult): void;
  (event: 'delete', resultId: GenerationHistoryResult['id']): void;
}>();

const handleClose = () => {
  emit('close');
};

const handleReuse = () => {
  if (props.result) {
    emit('reuse', props.result);
  }
};

const handleDownload = () => {
  if (props.result) {
    emit('download', props.result);
  }
};

const handleDelete = () => {
  if (props.result) {
    emit('delete', props.result.id);
  }
};
</script>
