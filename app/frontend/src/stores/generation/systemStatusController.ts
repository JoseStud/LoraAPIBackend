import { computed, ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';

import { ApiError } from '@/composables/shared';
import { fetchSystemStatus } from '@/services';
import { useGenerationConnectionStore } from '@/stores/generation';
import { useBackendBase } from '@/utils/backend';

const DEFAULT_POLL_INTERVAL = 10_000;

export interface SystemStatusController {
  readonly isPolling: ComputedRef<boolean>;
  ensureHydrated: () => Promise<void>;
  refresh: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

let singleton: SystemStatusController | null = null;

export const useSystemStatusController = (): SystemStatusController => {
  if (singleton) {
    return singleton;
  }

  const connectionStore = useGenerationConnectionStore();
  const { systemStatusReady } = storeToRefs(connectionStore);
  const backendBase = useBackendBase();
  const pollHandle = ref<ReturnType<typeof setInterval> | null>(null);
  const inFlight = ref<Promise<void> | null>(null);

  const stop = (): void => {
    if (pollHandle.value) {
      clearInterval(pollHandle.value);
      pollHandle.value = null;
    }
  };

  const refresh = async (): Promise<void> => {
    if (inFlight.value) {
      return inFlight.value;
    }

    const run = (async () => {
      try {
        const payload = await fetchSystemStatus(backendBase.value);
        connectionStore.resetSystemStatus();

        if (payload) {
          connectionStore.applySystemStatusPayload(payload);
          return;
        }

        connectionStore.markSystemStatusHydrated(new Date());
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 404) {
          connectionStore.resetSystemStatus();
          connectionStore.markSystemStatusUnavailable(new Date());
          stop();
          return;
        }

        connectionStore.resetSystemStatus();
        connectionStore.updateSystemStatus({ status: 'error', gpu_status: 'Unknown' });
        connectionStore.markSystemStatusHydrated(new Date());

        if (import.meta.env.DEV) {
          console.error('Failed to load system status', error);
        }
      } finally {
        inFlight.value = null;
      }
    })();

    inFlight.value = run;
    await run;
  };

  const start = (): void => {
    if (pollHandle.value) {
      return;
    }

    pollHandle.value = setInterval(() => {
      void refresh();
    }, DEFAULT_POLL_INTERVAL);
  };

  const ensureHydrated = async (): Promise<void> => {
    if (!systemStatusReady.value) {
      await refresh();
    }

    start();
  };

  const isPolling = computed(() => pollHandle.value != null);

  singleton = {
    isPolling,
    ensureHydrated,
    refresh,
    start,
    stop,
  };

  return singleton;
};

export default useSystemStatusController;
