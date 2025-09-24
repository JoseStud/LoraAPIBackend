import { ref, unref, type MaybeRefOrGetter, type Ref } from 'vue';

import { fetchActiveGenerationJobs } from '@/services';
import { DEFAULT_BACKEND_BASE } from '@/utils/backend';
import type { GenerationJobStatus } from '@/types';

export interface UseJobQueueTransportOptions {
  backendBase: MaybeRefOrGetter<string>;
}

export interface UseJobQueueTransportReturn {
  fetchJobs: () => Promise<GenerationJobStatus[] | null>;
  apiAvailable: Ref<boolean>;
}

const resolveBackendBase = (backendBase: MaybeRefOrGetter<string>): string => {
  try {
    const resolved =
      typeof backendBase === 'function'
        ? (backendBase as () => string)()
        : unref(backendBase);

    return typeof resolved === 'string' && resolved.trim() ? resolved : DEFAULT_BACKEND_BASE;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[JobQueue] Failed to resolve backend base', error);
    }
    return DEFAULT_BACKEND_BASE;
  }
};

export const useJobQueueTransport = (
  options: UseJobQueueTransportOptions,
): UseJobQueueTransportReturn => {
  const apiAvailable = ref(true);

  const fetchJobs = async (): Promise<GenerationJobStatus[] | null> => {
    const backendBase = resolveBackendBase(options.backendBase);

    try {
      const records = await fetchActiveGenerationJobs(backendBase);
      apiAvailable.value = true;
      return records;
    } catch (error) {
      apiAvailable.value = false;
      return null;
    }
  };

  return {
    fetchJobs,
    apiAvailable,
  } as const;
};

export type UseJobQueueTransportReturnType = ReturnType<typeof useJobQueueTransport>;
