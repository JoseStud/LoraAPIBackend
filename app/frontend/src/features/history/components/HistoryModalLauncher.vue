<template>
  <HistoryModal
    :visible="visible"
    :result="result"
    :formatted-date="formattedDate"
    @close="emit('close')"
    @reuse="emit('reuse', $event)"
    @download="emit('download', $event)"
    @delete="emit('delete', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { GenerationHistoryResult } from '@/types';

import HistoryModal from './HistoryModal.vue';

const props = defineProps<{
  visible: boolean;
  result: GenerationHistoryResult | null;
  formatDate: (date: string) => string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'reuse', result: GenerationHistoryResult): void;
  (event: 'download', result: GenerationHistoryResult): void;
  (event: 'delete', resultId: GenerationHistoryResult['id']): void;
}>();

const formattedDate = computed(() => (props.result ? props.formatDate(props.result.created_at) : ''));
</script>
