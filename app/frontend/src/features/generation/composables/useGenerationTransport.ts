import { extractGenerationErrorMessage } from '../services/updates';
import type { GenerationQueueClient } from '../services/queueClient';
import type { GenerationWebSocketManager } from '../services/websocketManager';
import type { GenerationJobInput } from '../stores/useGenerationOrchestratorStore';
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationProgressMessage,
  GenerationResult,
  ProgressUpdate,
  SystemStatusPayload,
  SystemStatusState,
  NotificationType,
} from '@/types';
import type {
  GenerationTransportError,
  GenerationTransportPausePayload,
  GenerationTransportResumePayload,
  GenerationWebSocketStateSnapshot,
} from '../types/transport';

import { useGenerationQueueClient } from './useGenerationQueueClient';
import { useGenerationSocketBridge } from './useGenerationSocketBridge';

export interface GenerationNotificationAdapter {
  notify(message: string, type?: NotificationType): void;
  debug?: (...args: unknown[]) => void;
}

export interface GenerationTransportOptions {
  getBackendUrl: () => string | null | undefined;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
  pollIntervalMs?: number;
  logger?: (...args: unknown[]) => void;
}

export interface GenerationTransportCallbacks {
  onSystemStatus?: (payload: SystemStatusPayload | Partial<SystemStatusState>) => void;
  onQueueUpdate?: (jobs: GenerationJobInput[]) => void;
  onProgress?: (message: GenerationProgressMessage | ProgressUpdate) => void;
  onComplete?: (message: GenerationCompleteMessage) => GenerationResult | void;
  onError?: (message: GenerationErrorMessage) => void;
  onRecentResults?: (results: GenerationResult[]) => void;
  onConnectionChange?: (connected: boolean, snapshot?: GenerationWebSocketStateSnapshot) => void;
  onConnectionStateChange?: (snapshot: GenerationWebSocketStateSnapshot) => void;
  onTransportError?: (error: GenerationTransportError) => void;
  shouldPollQueue?: () => boolean;
  onNotify?: (message: string, type?: NotificationType) => void;
  logger?: (...args: unknown[]) => void;
  onHydrateSystemStatus?: () => Promise<void> | void;
  onReleaseSystemStatus?: () => void;
}

export const useGenerationTransport = (
  options: GenerationTransportOptions,
  callbacks: GenerationTransportCallbacks,
) => {
  const logDebug = (...args: unknown[]): void => {
    if (typeof options.logger === 'function') {
      options.logger(...args);
    } else if (typeof callbacks.logger === 'function') {
      callbacks.logger(...args);
    }
  };

  const queueClient = useGenerationQueueClient(
    {
      getBackendUrl: options.getBackendUrl,
      queueClient: options.queueClient,
      pollIntervalMs: options.pollIntervalMs,
    },
    {
      onSystemStatus: (payload) => {
        callbacks.onSystemStatus?.(payload);
      },
      onQueueUpdate: (jobs) => {
        callbacks.onQueueUpdate?.(jobs);
      },
      onRecentResults: (results) => {
        callbacks.onRecentResults?.(results);
      },
      shouldPollQueue: callbacks.shouldPollQueue,
      onNotify: (message, type = 'info') => {
        callbacks.onNotify?.(message, type);
        callbacks.logger?.('[GenerationTransport]', message, type);
      },
      logger: (...args: unknown[]) => {
        logDebug(...args);
      },
      onHydrateSystemStatus: callbacks.onHydrateSystemStatus,
      onReleaseSystemStatus: callbacks.onReleaseSystemStatus,
      onTransportError: (error) => {
        callbacks.onTransportError?.(error);
      },
    },
  );

  const socketBridge = useGenerationSocketBridge(
    {
      getBackendUrl: options.getBackendUrl,
      websocketManager: options.websocketManager,
      logger: (...args: unknown[]) => {
        logDebug(...args);
      },
    },
    {
      onProgress: (message) => {
        callbacks.onProgress?.(message);
      },
      onComplete: (message) => {
        const result = callbacks.onComplete?.(message);
        callbacks.onNotify?.('Generation completed successfully', 'success');
        return result;
      },
      onError: (message) => {
        callbacks.onError?.(message);
        const errorMessage = extractGenerationErrorMessage(message);
        callbacks.onNotify?.(`Generation failed: ${errorMessage}`, 'error');
      },
      onQueueUpdate: (jobs) => {
        callbacks.onQueueUpdate?.(jobs);
      },
      onSystemStatus: (payload) => {
        callbacks.onSystemStatus?.(payload);
      },
      onConnectionChange: (connected, snapshot) => {
        callbacks.onConnectionChange?.(connected, snapshot);
      },
      onConnectionStateChange: (snapshot) => {
        callbacks.onConnectionStateChange?.(snapshot);
      },
      onTransportError: (error) => {
        callbacks.onTransportError?.(error);
      },
    },
  );

  let paused = false;
  let lastPausePayload: GenerationTransportPausePayload | null = null;
  let pendingResume: Promise<void> | null = null;

  const initializeUpdates = async (historyLimit: number): Promise<void> => {
    await queueClient.initialize(historyLimit);
    socketBridge.start();
    paused = false;
    lastPausePayload = null;
    pendingResume = null;
  };

  const stopUpdates = (): void => {
    queueClient.stopPolling();
    socketBridge.stop();
    paused = false;
    lastPausePayload = null;
    pendingResume = null;
  };

  const reconnectUpdates = (): void => {
    socketBridge.reconnect();
  };

  const clear = (): void => {
    stopUpdates();
    queueClient.clear();
    socketBridge.clear();
    paused = false;
    lastPausePayload = null;
    pendingResume = null;
  };

  const pauseUpdates = (payload: GenerationTransportPausePayload): void => {
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
    socketBridge.stop();
  };

  const resumeUpdates = async (
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
      socketBridge.start();
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
    startGeneration: queueClient.startGeneration,
    cancelJob: queueClient.cancelJob,
    deleteResult: queueClient.deleteResult,
    refreshSystemStatus: queueClient.refreshSystemStatus,
    refreshActiveJobs: queueClient.refreshActiveJobs,
    refreshRecentResults: queueClient.refreshRecentResults,
    refreshAllData: queueClient.refreshAllData,
    initializeUpdates,
    stopUpdates,
    reconnectUpdates,
    setPollInterval: queueClient.setPollInterval,
    pauseUpdates,
    resumeUpdates,
    clear,
    isPaused: () => paused,
  };
};

export type UseGenerationTransportReturn = ReturnType<typeof useGenerationTransport>;
