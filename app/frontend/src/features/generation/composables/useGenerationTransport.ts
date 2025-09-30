import {
  extractGenerationErrorMessage,
  type GenerationQueueClient,
  type GenerationWebSocketManager,
} from '@/features/generation/services';
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
import type { GenerationJobInput } from '@/features/generation';

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
  onConnectionChange?: (connected: boolean) => void;
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
      onConnectionChange: (connected) => {
        callbacks.onConnectionChange?.(connected);
      },
    },
  );

  const initializeUpdates = async (historyLimit: number): Promise<void> => {
    await queueClient.initialize(historyLimit);
    socketBridge.start();
  };

  const stopUpdates = (): void => {
    queueClient.stopPolling();
    socketBridge.stop();
  };

  const reconnectUpdates = (): void => {
    socketBridge.reconnect();
  };

  const clear = (): void => {
    stopUpdates();
    queueClient.clear();
    socketBridge.clear();
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
    clear,
  };
};

export type UseGenerationTransportReturn = ReturnType<typeof useGenerationTransport>;
