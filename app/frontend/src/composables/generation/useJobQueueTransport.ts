import { computed, ref, unref, type ComputedRef, type MaybeRefOrGetter, type Ref } from 'vue';

import { ApiError } from '@/composables/useApi';
import { fetchActiveGenerationJobs, fetchLegacyJobStatuses } from '@/services/generationService';
import { DEFAULT_BACKEND_BASE } from '@/utils/backend';

const PRIMARY_FAILURE_LOG_COOLDOWN = 5000;

export type JobQueueRecord = Record<string, unknown>;

export interface UseJobQueueTransportOptions {
  backendBase: MaybeRefOrGetter<string>;
}

export interface UseJobQueueTransportReturn {
  fetchJobs: () => Promise<JobQueueRecord[] | null>;
  apiAvailable: Ref<boolean>;
  legacyEndpointMissing: Ref<boolean>;
  isLegacyFallbackAvailable: ComputedRef<boolean>;
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

const createPrimaryFailureLogger = () => {
  const lastPrimaryFailureLogAt = ref<number | null>(null);

  return (error: unknown) => {
    if (!import.meta.env.DEV) {
      return;
    }

    const now = Date.now();
    if (!lastPrimaryFailureLogAt.value || now - lastPrimaryFailureLogAt.value >= PRIMARY_FAILURE_LOG_COOLDOWN) {
      console.info('[JobQueue] Generation endpoint unavailable, falling back', error);
      lastPrimaryFailureLogAt.value = now;
    }
  };
};

export const useJobQueueTransport = (
  options: UseJobQueueTransportOptions,
): UseJobQueueTransportReturn => {
  const apiAvailable = ref(true);
  const legacyEndpointMissing = ref(false);
  const legacyMissingLogged = ref(false);
  const logPrimaryFailure = createPrimaryFailureLogger();

  const fetchJobs = async (): Promise<JobQueueRecord[] | null> => {
    const backendBase = resolveBackendBase(options.backendBase);

    try {
      const records = await fetchActiveGenerationJobs(backendBase);
      apiAvailable.value = true;
      return records;
    } catch (error) {
      logPrimaryFailure(error);

      if (legacyEndpointMissing.value) {
        return null;
      }

      try {
        const fallbackRecords = await fetchLegacyJobStatuses(backendBase);
        apiAvailable.value = true;
        legacyEndpointMissing.value = false;
        legacyMissingLogged.value = false;
        return fallbackRecords;
      } catch (fallbackError) {
        if (fallbackError instanceof ApiError && fallbackError.status === 404) {
          legacyEndpointMissing.value = true;
          if (import.meta.env.DEV && !legacyMissingLogged.value) {
            console.info(
              '[JobQueue] Legacy job endpoint missing, continuing without fallback',
            );
            legacyMissingLogged.value = true;
          }
        } else if (import.meta.env.DEV) {
          console.info('[JobQueue] Legacy job endpoint failed', fallbackError);
        }

        return null;
      }
    }
  };

  return {
    fetchJobs,
    apiAvailable,
    legacyEndpointMissing,
    isLegacyFallbackAvailable: computed(() => !legacyEndpointMissing.value),
  } as const;
};

export type UseJobQueueTransportReturnType = ReturnType<typeof useJobQueueTransport>;
