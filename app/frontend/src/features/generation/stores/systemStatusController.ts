/** @internal */
import { computed, ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';

import { ApiError } from '@/composables/shared';
import { useBackendClient, type BackendHttpClient } from '@/services/shared/http';
import { fetchSystemStatus } from '@/services/system/systemService';
import { resolveBackendBaseUrl } from '@/utils/backend';
import { generationPollingConfig } from '../config/polling';
import { useGenerationConnectionStore } from './connection';

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

const DEFAULT_CONTROLLER_KEY = '__default__';

export interface AcquireSystemStatusControllerOptions {
  backendClient?: BackendHttpClient | null;
  resolveBackendClient?: () => BackendHttpClient | null | undefined;
  getBackendUrl?: () => string | null | undefined;
}

const createBackendClientResolver = (
  options?: AcquireSystemStatusControllerOptions,
): (() => BackendHttpClient) => {
  if (options?.backendClient) {
    return () => options.backendClient as BackendHttpClient;
  }

  if (options?.resolveBackendClient) {
    const fallbackClient = options.getBackendUrl
      ? useBackendClient(() => options.getBackendUrl?.() ?? null)
      : useBackendClient();

    return () => options.resolveBackendClient?.() ?? fallbackClient;
  }

  if (options?.getBackendUrl) {
    const overrideClient = useBackendClient(() => options.getBackendUrl?.() ?? null);
    return () => overrideClient;
  }

  const defaultClient = useBackendClient();
  return () => defaultClient;
};

const createController = (
  resolveBackendClient: () => BackendHttpClient,
): SystemStatusController => {
  const connectionStore = useGenerationConnectionStore();
  const { systemStatusReady } = storeToRefs(connectionStore);
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
        const payload = await fetchSystemStatus(resolveBackendClient());
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
    }, generationPollingConfig.systemStatusMs);
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

const normaliseControllerKey = (base?: string | null): string => {
  try {
    return resolveBackendBaseUrl(base ?? undefined);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to normalise backend base for system status controller', error);
    }
    return base?.toString() || DEFAULT_CONTROLLER_KEY;
  }
};

const resolveControllerKey = (
  options?: AcquireSystemStatusControllerOptions,
): string => {
  if (options?.backendClient) {
    return normaliseControllerKey(options.backendClient.resolve(''));
  }

  const resolvedClient = options?.resolveBackendClient?.();
  if (resolvedClient) {
    return normaliseControllerKey(resolvedClient.resolve(''));
  }

  if (options?.getBackendUrl) {
    const resolvedUrl = options.getBackendUrl() ?? '';
    return resolvedUrl ? normaliseControllerKey(resolvedUrl) : DEFAULT_CONTROLLER_KEY;
  }

  return DEFAULT_CONTROLLER_KEY;
};

const controllerRegistry = new Map<string, { controller: SystemStatusController; consumers: number }>();

const resolveController = (
  options?: AcquireSystemStatusControllerOptions,
): SystemStatusController => {
  const key = resolveControllerKey(options);
  const existing = controllerRegistry.get(key);
  if (existing) {
    return existing.controller;
  }

  const entry = {
    controller: createController(createBackendClientResolver(options)),
    consumers: 0,
  };

  controllerRegistry.set(key, entry);
  return entry.controller;
};

export const useSystemStatusController = (
  options?: AcquireSystemStatusControllerOptions,
): SystemStatusController => resolveController(options);

export const acquireSystemStatusController = (
  options?: AcquireSystemStatusControllerOptions,
): SystemStatusControllerHandle => {
  const key = resolveControllerKey(options);
  let entry = controllerRegistry.get(key);

  if (!entry) {
    entry = {
      controller: createController(createBackendClientResolver(options)),
      consumers: 0,
    };
    controllerRegistry.set(key, entry);
  }

  entry.consumers += 1;

  if (entry.consumers === 1) {
    entry.controller.start();
  }

  let released = false;

  const release = (): void => {
    if (released) {
      return;
    }

    released = true;
    entry!.consumers = Math.max(0, entry!.consumers - 1);

    if (entry!.consumers === 0) {
      entry!.controller.stop();
      controllerRegistry.delete(key);
    }
  };

  return { controller: entry.controller, release };
};

export default useSystemStatusController;
