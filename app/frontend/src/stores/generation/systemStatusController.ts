import { computed, ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';

import { ApiError } from '@/composables/shared';
import { fetchSystemStatus, useBackendClient } from '@/services';
import { useGenerationConnectionStore } from '@/stores/generation';

const DEFAULT_POLL_INTERVAL = 10_000;

export interface SystemStatusController {
  readonly isPolling: ComputedRef<boolean>;
  ensureHydrated: () => Promise<void>;
  refresh: () => Promise<void>;
  start: () => void;
  stop: () => void;
}

export interface SystemStatusControllerHandle {
  controller: SystemStatusController;
  release: () => void;
}

interface ControllerState {
  instance: SystemStatusController | null;
  consumers: number;
}

const controllerState: ControllerState = {
  instance: null,
  consumers: 0,
};

const createController = (): SystemStatusController => {
  const connectionStore = useGenerationConnectionStore();
  const { systemStatusReady } = storeToRefs(connectionStore);
  const backendClient = useBackendClient();
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
        const payload = await fetchSystemStatus(backendClient);
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

  return {
    isPolling,
    ensureHydrated,
    refresh,
    start,
    stop,
  };
};

const getController = (): SystemStatusController => {
  if (!controllerState.instance) {
    controllerState.instance = createController();
  }

  return controllerState.instance;
};

export const useSystemStatusController = (): SystemStatusController => getController();

export const acquireSystemStatusController = (): SystemStatusControllerHandle => {
  const controller = getController();
  controllerState.consumers += 1;

  if (controllerState.consumers === 1) {
    controller.start();
  }

  let released = false;

  const release = (): void => {
    if (released) {
      return;
    }

    released = true;
    controllerState.consumers = Math.max(0, controllerState.consumers - 1);

    if (controllerState.consumers === 0) {
      controller.stop();
    }
  };

  return { controller, release };
};

export default useSystemStatusController;
