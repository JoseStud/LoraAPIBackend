/** @internal */
import { ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';

import { ApiError, usePolling } from '@/composables/shared';
import { SystemStatusPayloadSchema } from '@/schemas';
import { useBackendClient, type BackendHttpClient } from '@/services/shared/http';
import { fetchSystemStatus } from '@/services/system/systemService';
import { resolveBackendBaseUrl } from '@/utils/backend';
import { generationPollingConfig } from '../config/polling';
import { logValidationIssues } from '../services/validation';
import { useGenerationOrchestratorStore } from './useGenerationOrchestratorStore';

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

interface ControllerEntry {
  controller: SystemStatusController;
  consumers: number;
}

const createController = (resolveBackendClient: () => BackendHttpClient): SystemStatusController => {
  const connectionStore = useGenerationOrchestratorStore();
  const { systemStatusReady } = storeToRefs(connectionStore);
  const inFlight = ref<Promise<void> | null>(null);
  // usePolling pauses the timer while the page is hidden or offline and refreshes once on resume.
  const polling = usePolling(() => refresh(), {
    interval: generationPollingConfig.systemStatusMs,
    minInterval: 1,
  });

  const stop = (): void => {
    polling.stop();
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
          const parsed = SystemStatusPayloadSchema.safeParse(payload);
          if (parsed.success) {
            connectionStore.applySystemStatusPayload(parsed.data);
            return;
          }
          logValidationIssues('system status', parsed.error, payload);
          connectionStore.updateSystemStatus({ status: 'error', gpu_status: 'Unknown' });
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
    polling.setInterval(generationPollingConfig.systemStatusMs);
    polling.start();
  };

  const ensureHydrated = async (): Promise<void> => {
    if (!systemStatusReady.value) {
      await refresh();
    }

    start();
  };

  return {
    isPolling: polling.isActive,
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

/**
 * Controllers are shared per backend base, so a consumer that names the backend URL and one that
 * relies on the configured default share one poller when they point at the same backend.
 */
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

  return normaliseControllerKey(options?.getBackendUrl?.() || null);
};

const controllerRegistry = new Map<string, ControllerEntry>();

const resolveEntry = (options?: AcquireSystemStatusControllerOptions): [string, ControllerEntry] => {
  const key = resolveControllerKey(options);
  const existing = controllerRegistry.get(key);
  if (existing) {
    return [key, existing];
  }

  const entry: ControllerEntry = {
    controller: createController(createBackendClientResolver(options)),
    consumers: 0,
  };

  controllerRegistry.set(key, entry);
  return [key, entry];
};

export const useSystemStatusController = (
  options?: AcquireSystemStatusControllerOptions,
): SystemStatusController => resolveEntry(options)[1].controller;

export const acquireSystemStatusController = (
  options?: AcquireSystemStatusControllerOptions,
): SystemStatusControllerHandle => {
  const [key, entry] = resolveEntry(options);

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
    entry.consumers = Math.max(0, entry.consumers - 1);

    if (entry.consumers === 0) {
      entry.controller.stop();
      controllerRegistry.delete(key);
    }
  };

  return { controller: entry.controller, release };
};

export default useSystemStatusController;
