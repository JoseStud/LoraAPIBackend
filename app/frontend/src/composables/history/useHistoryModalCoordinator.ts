import { computed, ref } from 'vue';

import type { GenerationHistoryResult, NotificationType } from '@/types';
import { useNotifications } from '@/composables/shared';

export const useHistoryModalCoordinator = () => {
  const modalVisible = ref(false);
  const activeResult = ref<GenerationHistoryResult | null>(null);

  const notifications = useNotifications();

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
    notifications.showToast(message, type);
  };

  return {
    modalVisible,
    activeResult,
    toastVisible: notifications.toastVisible,
    toastMessage: notifications.toastMessage,
    toastType: notifications.toastType,
    isModalOpen,
    openModal,
    closeModal,
    showToast,
  } as const;
};
