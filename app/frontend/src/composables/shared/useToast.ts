import { storeToRefs } from 'pinia';

import { useToastStore } from '@/stores/toast';
import type { NotificationType } from '@/types';

export const useToast = () => {
  const toastStore = useToastStore();
  const { isVisible, message, type, duration } = storeToRefs(toastStore);

  const showToast = (message: string, type: NotificationType = 'info', duration?: number): void => {
    toastStore.show(message, type, duration);
  };

  return {
    isVisible,
    message,
    type,
    duration,
    showToast,
    hideToast: toastStore.hide,
    showSuccess: toastStore.showSuccess,
    showError: toastStore.showError,
    showWarning: toastStore.showWarning,
    showInfo: toastStore.showInfo,
    clearTimer: toastStore.clearTimer,
  } as const;
};

export type UseToastReturn = ReturnType<typeof useToast>;
