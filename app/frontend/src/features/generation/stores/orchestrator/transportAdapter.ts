/**
 * @internal
 *
 * The generation transport adapter: active-job polling and the generation commands over HTTP
 * (through the typed `GenerationQueueClient` from `services/generationService.ts`) plus the
 * progress WebSocket (through `createGenerationWebSocketManager`), behind one object the
 * orchestrator store drives. `/system/status` is refreshed through the shared status controller,
 * which the store passes in as `refreshSystemStatus`. Creating an adapter starts nothing; polling
 * and the socket start in `initialize()`/`resume()` and stop in `pause()`/`clear()`, which only
 * the orchestrator store's lifecycle methods call.
 */
import { generationPollingConfig } from '../../config/polling';
import {
  createGenerationQueueClient,
  type GenerationQueueClient,
} from '../../services/generationService';
import {
  createGenerationWebSocketManager,
  type GenerationWebSocketManager,
} from '../../services/websocketManager';
import type { GenerationJobInput } from './queueModule';
import type {
  GenerationComplete,
  GenerationErrorMessage,
  GenerationJobStatus,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  NotificationType,
  ProgressUpdate,
} from '@/types';
import { ApiError } from '@/types/api';
import { normalizeJobStatus } from '@/utils/status';
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
  /** Replaces the client built from `getBackendUrl` (tests inject one). */
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
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
  /** Refreshes `/system/status` through the shared status controller. */
  refreshSystemStatus: () => Promise<void>;
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

/** Maps an active-job record onto the queue module's input, keeping the UI and backend ids. */
export const toQueueJobInput = (status: GenerationJobStatus): GenerationJobInput => {
  const backendId = status.jobId ?? status.id;
  const uiId = status.id ?? backendId;

  return {
    id: uiId,
    jobId: backendId ?? undefined,
    uiId: uiId ?? undefined,
    backendId: backendId ?? undefined,
    prompt: status.prompt ?? undefined,
    name: status.name ?? undefined,
    status: normalizeJobStatus(status.status),
    progress: status.progress,
    message: status.message ?? undefined,
    params: status.params ?? null,
    result: status.result ?? null,
    error: status.error ?? undefined,
    created_at: status.created_at,
    startTime: status.startTime ?? undefined,
  };
};

const toHttpTransportError = (
  context: string,
  error: unknown,
  metadata: Record<string, unknown> = {},
): GenerationTransportError => {
  let message = 'Unknown error';
  let statusCode: number | undefined;

  if (error instanceof ApiError) {
    message = error.message || `Request failed with status ${error.status}`;
    statusCode = error.status;
  } else if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  }

  return {
    source: 'http',
    context,
    message,
    timestamp: Date.now(),
    statusCode,
    details: { error, ...metadata },
  };
};

const normalizePollInterval = (interval: number): number => {
  const numeric = Math.floor(Number(interval));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : generationPollingConfig.queueMs;
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

  /** Notices about HTTP commands are also written to the debug log. */
  const notifyCommand = (message: string, type: NotificationType): void => {
    notify(message, type);
    logDebug('[GenerationTransport]', message, type);
  };

  const reportError = (
    context: string,
    error: unknown,
    metadata?: Record<string, unknown>,
  ): void => {
    options.onTransportError?.(toHttpTransportError(context, error, metadata));
  };

  // HTTP: one typed client, created on first use and dropped by clear().
  let queueClient: GenerationQueueClient | null = options.queueClient ?? null;

  const getQueueClient = (): GenerationQueueClient => {
    if (!queueClient) {
      queueClient = createGenerationQueueClient({ getBackendUrl: options.getBackendUrl });
    }
    return queueClient;
  };

  const refreshSystemStatus = (): Promise<void> => options.refreshSystemStatus();

  const refreshActiveJobs = async (): Promise<void> => {
    try {
      const active = await getQueueClient().fetchActiveJobs();
      options.onQueueUpdate(active.map(toQueueJobInput));
    } catch (error) {
      console.error('Failed to refresh active jobs:', error);
      reportError('refreshActiveJobs', error);
      throw error;
    }
  };

  const refreshRecentResults = async (limit: number, notifySuccess = false): Promise<void> => {
    try {
      const recent = await getQueueClient().fetchRecentResults(limit);
      options.onRecentResults(recent);
      if (notifySuccess) {
        notifyCommand('Results refreshed', 'success');
      }
    } catch (error) {
      console.error('Failed to refresh recent results:', error);
      reportError('refreshRecentResults', error);
      if (notifySuccess) {
        notifyCommand('Failed to refresh results', 'error');
      }
      throw error;
    }
  };

  const refreshAll = async (historyLimit: number): Promise<void> => {
    await Promise.all([
      refreshSystemStatus(),
      refreshActiveJobs(),
      refreshRecentResults(historyLimit),
    ]);
  };

  const startGeneration = (payload: GenerationRequestPayload): Promise<GenerationStartResponse> =>
    getQueueClient().startGeneration(payload);

  const cancelJob = async (jobId: string): Promise<void> => {
    try {
      await getQueueClient().cancelJob(jobId);
      notifyCommand('Generation cancelled', 'success');
    } catch (error) {
      reportError('cancelJob', error, { jobId });
      notifyCommand('Failed to cancel generation', 'error');
      throw error;
    }
  };

  const deleteResult = async (resultId: string | number): Promise<void> => {
    try {
      await getQueueClient().deleteResult(resultId);
      notifyCommand('Result deleted', 'success');
    } catch (error) {
      reportError('deleteResult', error, { resultId });
      notifyCommand('Failed to delete result', 'error');
      throw error;
    }
  };

  // Active-job polling. Each tick fetches only while `shouldPollQueue()` (jobs are active).
  let pollInterval = options.initialPollInterval ?? generationPollingConfig.queueMs;
  let pollTimer: number | null = null;

  const startPolling = (): void => {
    if (typeof window === 'undefined' || pollTimer != null) {
      return;
    }

    pollTimer = window.setInterval(async () => {
      try {
        if (options.shouldPollQueue()) {
          await refreshActiveJobs();
        }
      } catch (error) {
        console.error('Failed to refresh generation data during polling:', error);
        logDebug('Queue polling cycle failed', error);
        reportError('pollActiveJobs', error);
      }
    }, pollInterval);
  };

  const stopPolling = (): void => {
    if (typeof window === 'undefined' || pollTimer == null) {
      return;
    }

    window.clearInterval(pollTimer);
    pollTimer = null;
  };

  const setPollInterval = (interval: number): void => {
    pollInterval = normalizePollInterval(interval);

    if (pollTimer != null) {
      stopPolling();
      startPolling();
    }
  };

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
    await refreshAll(historyLimit);
    startPolling();
    await options.onHydrateSystemStatus();
    startSocket();
    resetPauseState();
  };

  const clear = (): void => {
    stopPolling();
    stopSocket();
    websocketManager = null;
    queueClient = null;
    options.onReleaseSystemStatus();
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
    stopPolling();
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
      await refreshAll(historyLimit);
      startSocket();
      startPolling();
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
    refreshSystemStatus,
    refreshActiveJobs,
    refreshRecentResults,
    refreshAll,
    startGeneration,
    cancelJob,
    deleteResult,
    reconnect: () => {
      ensureWebSocketManager().reconnect();
    },
    setPollInterval,
    pause,
    resume,
    isPaused: () => paused,
    clear,
  };
};
