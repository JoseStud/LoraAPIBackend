import { computed, onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';

import { useAdminMetricsStore } from '@/stores';
import type { AdminMetricsStore } from '@/stores';
import { usePolling, type PollingController } from '../shared/usePolling';

const formatRelativeTime = (input: Date | null): string => {
  if (!input) {
    return 'Never';
  }

  const now = Date.now();
  const target = input.getTime();
  const diffMs = Math.max(0, now - target);
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 30) {
    return 'moments ago';
  }
  if (diffSeconds < 90) {
    return 'about a minute ago';
  }
  if (diffSeconds < 3600) {
    return `${Math.round(diffSeconds / 60)} minutes ago`;
  }
  if (diffSeconds < 5400) {
    return 'about an hour ago';
  }
  if (diffSeconds < 86_400) {
    return `${Math.round(diffSeconds / 3600)} hours ago`;
  }

  const days = Math.round(diffSeconds / 86_400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

interface UseAdminMetricsOptions {
  intervalMs?: number;
}

const MIN_POLL_INTERVAL = 1_000;
const DEFAULT_POLL_INTERVAL = 5_000;

let pollingController: PollingController | null = null;
let pollingStore: AdminMetricsStore | null = null;

const ensurePollingController = (store: AdminMetricsStore): PollingController => {
  if (!pollingController || pollingStore !== store) {
    pollingController?.stop();
    pollingController = usePolling(() => store.refresh({ showLoader: false }), {
      interval: DEFAULT_POLL_INTERVAL,
      minInterval: MIN_POLL_INTERVAL,
    });
    pollingStore = store;
  }

  return pollingController;
};

export const useAdminMetrics = (options: UseAdminMetricsOptions = {}) => {
  const store = useAdminMetricsStore();
  const refs = storeToRefs(store);
  const polling = ensurePollingController(store);

  const lastUpdatedLabel = computed(() => formatRelativeTime(refs.lastUpdated.value));

  let hasSubscription = false;

  onMounted(() => {
    const started = polling.subscribe(options.intervalMs);
    hasSubscription = true;

    if (started) {
      void store.refresh({ showLoader: !refs.isReady.value });
    }
  });

  onBeforeUnmount(() => {
    if (hasSubscription) {
      polling.unsubscribe();
      hasSubscription = false;
    }
  });

  const refresh = (showLoader = true) => store.refresh({ showLoader });

  return {
    ...refs,
    lastUpdatedLabel,
    refresh,
    pollIntervalMs: polling.intervalMs,
    isPolling: polling.isActive,
    setPollInterval: polling.setInterval,
    startPolling: polling.start,
    stopPolling: polling.stop,
  };
};

export type UseAdminMetricsReturn = ReturnType<typeof useAdminMetrics>;
