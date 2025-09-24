import { computed, ref } from 'vue';

import type { GenerationHistoryResult } from '@/types';

import { useHistoryToast, type HistoryToastType } from './useHistoryToast';

export const useHistoryModalCoordinator = () => {
  const modalVisible = ref(false);
  const activeResult = ref<GenerationHistoryResult | null>(null);

  const { toastVisible, toastMessage, toastType, showToastMessage } = useHistoryToast();

  const isModalOpen = computed(() => modalVisible.value);

  const openModal = (result: GenerationHistoryResult): void => {
    activeResult.value = result;
    modalVisible.value = true;
  };

  const closeModal = (): void => {
    modalVisible.value = false;
    activeResult.value = null;
  };

  const showToast = (message: string, type: HistoryToastType = 'success'): void => {
    showToastMessage(message, type);
  };

  return {
    modalVisible,
    activeResult,
    toastVisible,
    toastMessage,
    toastType,
    isModalOpen,
    openModal,
    closeModal,
    showToast,
  } as const;
};
