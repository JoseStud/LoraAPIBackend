import { onBeforeUnmount, onMounted, ref, watch, type ComputedRef } from 'vue';

import type { GenerationJobStatus } from '@/types';

export interface UseJobQueuePollingOptions {
  disabled: ComputedRef<boolean>;
  pollInterval: ComputedRef<number>;
  fetchJobs: () => Promise<GenerationJobStatus[] | null>;
  onRecord: (record: GenerationJobStatus) => void;
}

export const useJobQueuePolling = ({
  disabled,
  pollInterval,
  fetchJobs,
  onRecord,
}: UseJobQueuePollingOptions) => {
  const isReady = ref(false);
  const isPolling = ref(false);
  const pollTimer = ref<ReturnType<typeof setInterval> | null>(null);

  const applyRecords = (records: GenerationJobStatus[] | null | undefined): void => {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    records.forEach((record) => onRecord(record));
  };

  const refresh = async (): Promise<void> => {
    if (isPolling.value || disabled.value) {
      if (!isReady.value) {
        isReady.value = true;
      }
      return;
    }

    isPolling.value = true;

    try {
      const records = await fetchJobs();
      applyRecords(records ?? undefined);
    } finally {
      isPolling.value = false;
      if (!isReady.value) {
        isReady.value = true;
      }
    }
  };

  const stopPolling = (): void => {
    if (pollTimer.value) {
      clearInterval(pollTimer.value);
      pollTimer.value = null;
    }
    isPolling.value = false;
  };

  const startPolling = (): void => {
    if (pollTimer.value || disabled.value) {
      if (!isReady.value) {
        isReady.value = true;
      }
      return;
    }

    isReady.value = true;
    void refresh();

    pollTimer.value = setInterval(() => {
      if (!isPolling.value && !disabled.value) {
        void refresh();
      }
    }, pollInterval.value);
  };

  watch(disabled, (nextDisabled) => {
    if (nextDisabled) {
      stopPolling();
    } else if (!pollTimer.value) {
      startPolling();
    }
  });

  watch(pollInterval, () => {
    if (pollTimer.value) {
      stopPolling();
      startPolling();
    }
  });

  onMounted(() => {
    startPolling();
  });

  onBeforeUnmount(() => {
    stopPolling();
  });

  return {
    isReady,
    isPolling,
    refresh,
    startPolling,
    stopPolling,
  } as const;
};

export type UseJobQueuePollingReturn = ReturnType<typeof useJobQueuePolling>;
