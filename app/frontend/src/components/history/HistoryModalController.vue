<template>
  <HistoryModalLauncher
    :visible="modalVisible"
    :result="activeResult"
    :format-date="formatDate"
    @close="closeModal"
    @reuse="handleReuse"
    @download="handleDownload"
    @delete="handleDelete"
  />

  <HistoryToast :visible="toastVisible" :message="toastMessage" :type="toastType" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

import { useHistoryToast, type HistoryToastType } from '@/composables/history';
import type { GenerationHistoryResult } from '@/types';

import HistoryModalLauncher from './HistoryModalLauncher.vue';
import HistoryToast from './HistoryToast.vue';

const props = defineProps<{
  formatDate: (date: string) => string;
  onReuse: (result: GenerationHistoryResult) => Promise<boolean> | boolean;
  onDownload: (result: GenerationHistoryResult) => Promise<boolean> | boolean;
  onDelete: (resultId: GenerationHistoryResult['id']) => Promise<boolean>;
}>();

const { toastVisible, toastMessage, toastType, showToastMessage } = useHistoryToast();

const modalVisible = ref(false);
const activeResult = ref<GenerationHistoryResult | null>(null);
const isModalOpen = computed(() => modalVisible.value);

const openModal = (result: GenerationHistoryResult): void => {
  activeResult.value = result;
  modalVisible.value = true;
};

const closeModal = (): void => {
  modalVisible.value = false;
  activeResult.value = null;
};

const handleReuse = async (result: GenerationHistoryResult): Promise<void> => {
  await props.onReuse(result);
  closeModal();
};

const handleDownload = async (result: GenerationHistoryResult): Promise<void> => {
  await props.onDownload(result);
};

const handleDelete = async (
  resultId: GenerationHistoryResult['id'],
): Promise<void> => {
  const deleted = await props.onDelete(resultId);
  if (deleted) {
    closeModal();
  }
};

const showToast = (message: string, type: HistoryToastType = 'success'): void => {
  showToastMessage(message, type);
};

defineExpose({
  openModal,
  closeModal,
  showToast,
  isModalOpen,
});
</script>
