import { onUnmounted, ref } from 'vue';

export type HistoryToastType = 'success' | 'error' | 'info' | 'warning';

export interface UseHistoryToastOptions {
  duration?: number;
}

export const useHistoryToast = ({ duration = 3000 }: UseHistoryToastOptions = {}) => {
  const toastVisible = ref(false);
  const toastMessage = ref('');
  const toastType = ref<HistoryToastType>('success');

  let timeout: ReturnType<typeof setTimeout> | undefined;

  const clearToastTimer = (): void => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = undefined;
    }
  };

  const hideToast = (): void => {
    toastVisible.value = false;
  };

  const showToastMessage = (message: string, type: HistoryToastType = 'success'): void => {
    clearToastTimer();

    toastMessage.value = message;
    toastType.value = type;
    toastVisible.value = true;

    timeout = setTimeout(() => {
      hideToast();
      timeout = undefined;
    }, duration);
  };

  onUnmounted(() => {
    clearToastTimer();
  });

  return {
    toastVisible,
    toastMessage,
    toastType,
    showToastMessage,
    hideToast,
    clearToastTimer,
  } as const;
};
