import { onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';

import type { JobQueueRecord } from '@/composables/generation';

export interface UseJobQueuePollingOptions {
  disabled: ComputedRef<boolean>;
  pollInterval: ComputedRef<number>;
  apiAvailable: Ref<boolean>;
  fetchJobs: () => Promise<JobQueueRecord[] | null>;
  onRecord: (record: JobQueueRecord) => void;
}

export const useJobQueuePolling = ({
  disabled,
  pollInterval,
  apiAvailable,
  fetchJobs,
  onRecord,
}: UseJobQueuePollingOptions) => {
  const isReady = ref(false);
  const isPolling = ref(false);
  const pollTimer = ref<ReturnType<typeof setInterval> | null>(null);

  const applyRecords = (records: JobQueueRecord[] | null | undefined): void => {
    if (!Array.isArray(records) || records.length === 0) {
      return;
    }

    records.forEach((record) => onRecord(record));
  };

  const refresh = async (): Promise<void> => {
    if (isPolling.value || disabled.value || !apiAvailable.value) {
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
      if (!isPolling.value && !disabled.value && apiAvailable.value) {
        void refresh();
      }
    }, pollInterval.value);
  };

  watch(disabled, (nextDisabled) => {
    if (nextDisabled) {
      stopPolling();
    } else if (!pollTimer.value && apiAvailable.value) {
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
