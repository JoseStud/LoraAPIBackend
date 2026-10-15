/** @internal */
import { computed, ref, type ComputedRef } from 'vue';
import { storeToRefs } from 'pinia';

import { ApiError } from '@/composables/shared';
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
  /** Pauses the poll timer while the page is hidden or offline; `start()` still records intent. */
  setEnvironmentPaused: (paused: boolean) => void;
  detachEnvironment: (() => void) | null;
}

const isEnvironmentPaused = (): boolean => {
  const hidden = typeof document !== 'undefined' && document.hidden === true;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return hidden || offline;
};

const createController = (
  resolveBackendClient: () => BackendHttpClient,
): Omit<ControllerEntry, 'consumers' | 'detachEnvironment'> => {
  const connectionStore = useGenerationOrchestratorStore();
  const { systemStatusReady } = storeToRefs(connectionStore);
  const pollHandle = ref<ReturnType<typeof setInterval> | null>(null);
  const inFlight = ref<Promise<void> | null>(null);
  // `wantsPolling` is what consumers asked for; the timer only runs while the environment allows it.
  let wantsPolling = false;
  let environmentPaused = false;

  const clearTimer = (): void => {
    if (pollHandle.value) {
      clearInterval(pollHandle.value);
      pollHandle.value = null;
    }
  };

  const stop = (): void => {
    wantsPolling = false;
    clearTimer();
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

  const startTimer = (): void => {
    if (pollHandle.value || environmentPaused) {
      return;
    }

    pollHandle.value = setInterval(() => {
      void refresh();
    }, generationPollingConfig.systemStatusMs);
  };

  const start = (): void => {
    wantsPolling = true;
    startTimer();
  };

  const setEnvironmentPaused = (paused: boolean): void => {
    if (paused === environmentPaused) {
      return;
    }

    environmentPaused = paused;

    if (paused) {
      clearTimer();
      return;
    }

    if (wantsPolling) {
      startTimer();
      void refresh();
    }
  };

  const ensureHydrated = async (): Promise<void> => {
    if (!systemStatusReady.value) {
      await refresh();
    }

    start();
  };

  const isPolling = computed(() => pollHandle.value != null);

  return {
    controller: {
      isPolling,
      ensureHydrated,
      refresh,
      start,
      stop,
    },
    setEnvironmentPaused,
  };
};

/** Follows `visibilitychange`/`online`/`offline` while the entry has consumers. */
const attachEnvironment = (entry: ControllerEntry): (() => void) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const apply = (): void => {
    entry.setEnvironmentPaused(isEnvironmentPaused());
  };

  document.addEventListener('visibilitychange', apply);
  window.addEventListener('online', apply);
  window.addEventListener('offline', apply);
  apply();

  return () => {
    document.removeEventListener('visibilitychange', apply);
    window.removeEventListener('online', apply);
    window.removeEventListener('offline', apply);
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
    ...createController(createBackendClientResolver(options)),
    consumers: 0,
    detachEnvironment: null,
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
    entry.detachEnvironment = attachEnvironment(entry);
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
      entry.detachEnvironment?.();
      entry.detachEnvironment = null;
      entry.controller.stop();
      controllerRegistry.delete(key);
    }
  };

  return { controller: entry.controller, release };
};

export default useSystemStatusController;
