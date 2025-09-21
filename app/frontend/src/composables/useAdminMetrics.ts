import { computed, onBeforeUnmount, onMounted } from 'vue';
import { storeToRefs } from 'pinia';

import { useAdminMetricsStore } from '@/stores/adminMetrics';

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

export const useAdminMetrics = (options: UseAdminMetricsOptions = {}) => {
  const store = useAdminMetricsStore();
  const refs = storeToRefs(store);

  const lastUpdatedLabel = computed(() => formatRelativeTime(refs.lastUpdated.value));

  onMounted(() => {
    store.subscribe(options.intervalMs);
  });

  onBeforeUnmount(() => {
    store.unsubscribe();
  });

  const refresh = (showLoader = true) => store.refresh({ showLoader });

  return {
    ...refs,
    lastUpdatedLabel,
    refresh,
  };
};

export type UseAdminMetricsReturn = ReturnType<typeof useAdminMetrics>;
