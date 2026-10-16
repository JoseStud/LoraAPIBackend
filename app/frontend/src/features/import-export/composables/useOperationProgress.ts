import { computed, ref } from 'vue';

import type { ProgressUpdate } from './useExportWorkflow';

export type OperationType = 'export' | 'import' | 'migration';

export interface ProgressMessage {
  id: number | string;
  text: string;
}

const PROGRESS_TITLES: Record<OperationType, string> = {
  export: 'Export Progress',
  import: 'Import Progress',
  migration: 'Migration Progress'
};

export function useOperationProgress() {
  const showProgress = ref(false);
  const progressValue = ref(0);
  const currentStep = ref('');
  const progressMessages = ref<ProgressMessage[]>([]);
  const currentOperation = ref<OperationType | null>(null);

  const progressTitle = computed(() => {
    if (!currentOperation.value) {
      return 'Progress';
    }
    return PROGRESS_TITLES[currentOperation.value] ?? 'Progress';
  });

  const reset = () => {
    progressValue.value = 0;
    currentStep.value = '';
    progressMessages.value = [];
  };

  const begin = (operation: OperationType) => {
    currentOperation.value = operation;
    reset();
    showProgress.value = true;
  };

  const update = (update: ProgressUpdate) => {
    if (typeof update.value === 'number') {
      progressValue.value = update.value;
    }

    if (typeof update.step === 'string') {
      currentStep.value = update.step;
    }

    if (update.message) {
      progressMessages.value = [
        ...progressMessages.value,
        {
          id: Date.now() + Math.random(),
          text: `[${new Date().toLocaleTimeString()}] ${update.message}`
        }
      ];
    }
  };

  const end = () => {
    showProgress.value = false;
    currentOperation.value = null;
  };

  return {
    showProgress,
    progressTitle,
    progressValue,
    currentStep,
    progressMessages,
    currentOperation,
    begin,
    update,
    end,
    reset
  };
}
