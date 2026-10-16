import { onBeforeUnmount, ref } from 'vue';

import type { NotifyType } from './useExportWorkflow';

export interface UseWorkflowToastOptions {
  duration?: number;
}

export function useWorkflowToast(options: UseWorkflowToastOptions = {}) {
  const { duration = 3000 } = options;

  const showToast = ref(false);
  const toastMessage = ref('');
  const toastType = ref<NotifyType>('info');

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  const notify = (message: string, type: NotifyType = 'info') => {
    toastMessage.value = message;
    toastType.value = type;
    showToast.value = true;

    clear();

    timeoutId = setTimeout(() => {
      showToast.value = false;
      timeoutId = undefined;
    }, duration);
  };

  const dismiss = () => {
    showToast.value = false;
    clear();
  };

  onBeforeUnmount(() => {
    clear();
  });

  return {
    showToast,
    toastMessage,
    toastType,
    notify,
    dismiss
  };
}
