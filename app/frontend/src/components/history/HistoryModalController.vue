<template>
  <HistoryModalLauncher
    :visible="modalVisible"
    :result="activeResult"
    :format-date="formatDate"
    @close="$emit('close')"
    @reuse="$emit('reuse', $event)"
    @download="$emit('download', $event)"
    @delete="$emit('delete', $event)"
  />

  <HistoryToast :visible="toastVisible" :message="toastMessage" :type="toastType" />
</template>

<script setup lang="ts">
import type { PropType } from 'vue';

import type { GenerationHistoryResult } from '@/types';
import type { HistoryToastType } from '@/composables/history';

import HistoryModalLauncher from './HistoryModalLauncher.vue';
import HistoryToast from './HistoryToast.vue';

defineProps({
  modalVisible: {
    type: Boolean,
    required: true,
  },
  activeResult: {
    type: Object as PropType<GenerationHistoryResult | null>,
    default: null,
  },
  toastVisible: {
    type: Boolean,
    required: true,
  },
  toastMessage: {
    type: String,
    required: true,
  },
  toastType: {
    type: String as PropType<HistoryToastType>,
    required: true,
  },
  formatDate: {
    type: Function as PropType<(date: string) => string>,
    required: true,
  },
});

defineEmits<{
  (event: 'close'): void;
  (event: 'reuse', result: GenerationHistoryResult): void;
  (event: 'download', result: GenerationHistoryResult): void;
  (event: 'delete', resultId: GenerationHistoryResult['id']): void;
}>();
</script>
