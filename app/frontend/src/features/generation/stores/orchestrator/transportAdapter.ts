/**
 * @internal
 *
 * The generation transport adapter: HTTP polling (through `useGenerationQueueClient`) plus the
 * progress WebSocket (through `createGenerationWebSocketManager`), behind one object the
 * orchestrator store drives. Creating an adapter starts nothing; polling and the socket start in
 * `initialize()`/`resume()` and stop in `pause()`/`clear()`, which only the orchestrator store's
 * lifecycle methods call.
 */
import { useGenerationQueueClient } from '../../composables/useGenerationQueueClient';
import type { GenerationQueueClient } from '../../services/queueClient';
import {
  createGenerationWebSocketManager,
  type GenerationWebSocketManager,
} from '../../services/websocketManager';
import type { GenerationJobInput } from './queueModule';
import type {
  GenerationComplete,
  GenerationErrorMessage,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  NotificationType,
  ProgressUpdate,
  SystemStatusPayload,
  SystemStatusState,
} from '@/types';
import type {
  GenerationNotificationAdapter,
  GenerationTransportError,
  GenerationTransportPausePayload,
  GenerationTransportResumePayload,
  GenerationWebSocketStateSnapshot,
} from '../../types/transport';

export interface GenerationTransportAdapterOptions {
  getBackendUrl: () => string | null | undefined;
  notificationAdapter: GenerationNotificationAdapter;
  initialPollInterval: number;
  shouldPollQueue: () => boolean;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
  onSystemStatus: (payload: SystemStatusPayload | Partial<SystemStatusState>) => void;
  onQueueUpdate: (jobs: GenerationJobInput[]) => void;
  onProgress: (message: ProgressUpdate) => void;
  onComplete: (message: GenerationComplete) => void;
  onError: (message: GenerationErrorMessage) => void;
  onRecentResults: (results: GenerationResult[]) => void;
  onConnectionChange: (connected: boolean, snapshot?: GenerationWebSocketStateSnapshot) => void;
  onConnectionStateChange?: (snapshot: GenerationWebSocketStateSnapshot) => void;
  onTransportError?: (error: GenerationTransportError) => void;
  onHydrateSystemStatus: () => Promise<void> | void;
  onReleaseSystemStatus: () => void;
  /** Fetches `/system/status` through the shared status controller instead of the queue client. */
  refreshSystemStatus?: () => Promise<void>;
}

export interface GenerationTransportAdapter {
  initialize: (historyLimit: number) => Promise<void>;
  refreshSystemStatus: () => Promise<void>;
  refreshActiveJobs: () => Promise<void>;
  refreshRecentResults: (historyLimit: number, notifySuccess?: boolean) => Promise<void>;
  refreshAll: (historyLimit: number) => Promise<void>;
  startGeneration: (payload: GenerationRequestPayload) => Promise<GenerationStartResponse>;
  cancelJob: (jobId: string) => Promise<void>;
  deleteResult: (resultId: string | number) => Promise<void>;
  reconnect: () => void;
  setPollInterval: (interval: number) => void;
  pause: (payload: GenerationTransportPausePayload) => void;
  resume: (
    historyLimit: number,
    payload: GenerationTransportResumePayload,
  ) => Promise<void>;
  isPaused: () => boolean;
  clear: () => void;
}

const extractGenerationErrorMessage = (message: GenerationErrorMessage): string => {
  if (typeof message.error === 'string' && message.error.trim()) {
    return message.error;
  }
  if (typeof message.status === 'string' && message.status.trim()) {
    return message.status;
  }
  return 'Unknown error';
};

export const createGenerationTransportAdapter = (
  options: GenerationTransportAdapterOptions,
): GenerationTransportAdapter => {
  const logDebug = (...args: unknown[]): void => {
    options.notificationAdapter.debug?.(...args);
  };

  const notify = (message: string, type: NotificationType = 'info'): void => {
    options.notificationAdapter.notify(message, type);
  };

  const queueClient = useGenerationQueueClient(
    {
      getBackendUrl: options.getBackendUrl,
      queueClient: options.queueClient,
      pollIntervalMs: options.initialPollInterval,
    },
    {
      onSystemStatus: (payload) => {
        options.onSystemStatus(payload);
      },
      onQueueUpdate: (jobs) => {
        options.onQueueUpdate(jobs);
      },
      onRecentResults: (results) => {
        options.onRecentResults(results);
      },
      shouldPollQueue: () => options.shouldPollQueue(),
      onNotify: (message, type = 'info') => {
        notify(message, type);
        logDebug('[GenerationTransport]', message, type);
      },
      logger: logDebug,
      onHydrateSystemStatus: () => options.onHydrateSystemStatus(),
      onReleaseSystemStatus: () => options.onReleaseSystemStatus(),
      refreshSystemStatus: options.refreshSystemStatus,
      onTransportError: (error) => {
        options.onTransportError?.(error);
      },
    },
  );

  // The WebSocket manager is created lazily on the first start/reconnect, and dropped by clear().
  let websocketManager: GenerationWebSocketManager | null = options.websocketManager ?? null;

  const ensureWebSocketManager = (): GenerationWebSocketManager => {
    if (websocketManager) {
      return websocketManager;
    }

    websocketManager = createGenerationWebSocketManager({
      getBackendUrl: options.getBackendUrl,
      logger: logDebug,
      onProgress: (message) => {
        options.onProgress(message);
      },
      onComplete: (message) => {
        options.onComplete(message);
        notify('Generation completed successfully', 'success');
      },
      onError: (message) => {
        options.onError(message);
        notify(`Generation failed: ${extractGenerationErrorMessage(message)}`, 'error');
      },
      onConnectionChange: (connected) => {
        options.onConnectionChange(connected);
      },
      onStateChange: (snapshot) => {
        options.onConnectionStateChange?.(snapshot);
      },
      onTransportError: (error) => {
        options.onTransportError?.(error);
      },
    });

    return websocketManager;
  };

  const startSocket = (): void => {
    ensureWebSocketManager().start();
  };

  const stopSocket = (): void => {
    websocketManager?.stop();
  };

  let paused = false;
  let lastPausePayload: GenerationTransportPausePayload | null = null;
  let pendingResume: Promise<void> | null = null;

  const resetPauseState = (): void => {
    paused = false;
    lastPausePayload = null;
    pendingResume = null;
  };

  const initialize = async (historyLimit: number): Promise<void> => {
    await queueClient.initialize(historyLimit);
    startSocket();
    resetPauseState();
  };

  const clear = (): void => {
    queueClient.stopPolling();
    stopSocket();
    resetPauseState();
    queueClient.clear();
    stopSocket();
    websocketManager = null;
    resetPauseState();
  };

  const pause = (payload: GenerationTransportPausePayload): void => {
    const snapshot: GenerationTransportPausePayload = {
      ...payload,
      reasons: [...payload.reasons],
    };
    lastPausePayload = Object.freeze(snapshot);

    if (paused) {
      return;
    }

    logDebug('[GenerationTransport] pause requested', snapshot);
    pendingResume = null;
    paused = true;
    queueClient.stopPolling();
    stopSocket();
  };

  const resume = async (
    historyLimit: number,
    payload: GenerationTransportResumePayload,
  ): Promise<void> => {
    if (pendingResume) {
      await pendingResume;
      return;
    }

    if (!paused && !lastPausePayload) {
      return;
    }

    logDebug('[GenerationTransport] resume requested', payload);

    const operation = (async () => {
      await queueClient.refreshAllData(historyLimit);
      startSocket();
      queueClient.startPolling();
      paused = false;
      lastPausePayload = null;
    })()
      .catch((error) => {
        paused = true;
        throw error;
      })
      .finally(() => {
        pendingResume = null;
      });

    pendingResume = operation;
    await operation;
  };

  return {
    initialize,
    refreshSystemStatus: () => queueClient.refreshSystemStatus(),
    refreshActiveJobs: () => queueClient.refreshActiveJobs(),
    refreshRecentResults: (historyLimit: number, notifySuccess?: boolean) =>
      queueClient.refreshRecentResults(historyLimit, notifySuccess),
    refreshAll: (historyLimit: number) => queueClient.refreshAllData(historyLimit),
    startGeneration: queueClient.startGeneration,
    cancelJob: queueClient.cancelJob,
    deleteResult: queueClient.deleteResult,
    reconnect: () => {
      ensureWebSocketManager().reconnect();
    },
    setPollInterval: (interval: number) => queueClient.setPollInterval(interval),
    pause,
    resume,
    isPaused: () => paused,
    clear,
  };
};
