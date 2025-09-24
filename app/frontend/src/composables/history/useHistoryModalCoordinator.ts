import { computed, ref } from 'vue';

import type { GenerationHistoryResult, NotificationType } from '@/types';
import { useToast } from '@/composables/shared';

export const useHistoryModalCoordinator = () => {
  const modalVisible = ref(false);
  const activeResult = ref<GenerationHistoryResult | null>(null);

  const toast = useToast();

  const isModalOpen = computed(() => modalVisible.value);

  const openModal = (result: GenerationHistoryResult): void => {
    activeResult.value = result;
    modalVisible.value = true;
  };

  const closeModal = (): void => {
    modalVisible.value = false;
    activeResult.value = null;
  };

  const showToast = (message: string, type: NotificationType = 'success'): void => {
    toast.showToast(message, type);
  };

  return {
    modalVisible,
    activeResult,
    toastVisible: toast.isVisible,
    toastMessage: toast.message,
    toastType: toast.type,
    isModalOpen,
    openModal,
    closeModal,
    showToast,
  } as const;
};
