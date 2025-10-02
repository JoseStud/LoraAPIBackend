import type { GenerationNotificationAdapter } from './useGenerationTransport';
import { useGenerationTransport } from './useGenerationTransport';
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
} from '@/types';
import type {
  GenerationTransportError,
  GenerationWebSocketStateSnapshot,
} from '../types/transport';

export interface GenerationTransportAdapterOptions {
  getBackendUrl: () => string | null | undefined;
  notificationAdapter: GenerationNotificationAdapter;
  initialPollInterval: number;
  shouldPollQueue: () => boolean;
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
  onSystemStatus: (payload: SystemStatusPayload | Partial<SystemStatusState>) => void;
  onQueueUpdate: (jobs: GenerationJobInput[]) => void;
  onProgress: (message: GenerationProgressMessage | ProgressUpdate) => void;
  onComplete: (message: GenerationCompleteMessage) => GenerationResult | void;
  onError: (message: GenerationErrorMessage) => void;
  onRecentResults: (results: GenerationResult[]) => void;
  onConnectionChange: (connected: boolean, snapshot?: GenerationWebSocketStateSnapshot) => void;
  onConnectionStateChange?: (snapshot: GenerationWebSocketStateSnapshot) => void;
  onTransportError?: (error: GenerationTransportError) => void;
  onHydrateSystemStatus: () => Promise<void> | void;
  onReleaseSystemStatus: () => void;
}

export interface GenerationTransportAdapter {
  initialize: (historyLimit: number) => Promise<void>;
  refreshSystemStatus: () => Promise<void>;
  refreshActiveJobs: () => Promise<void>;
  refreshRecentResults: (historyLimit: number, notifySuccess?: boolean) => Promise<void>;
  refreshAll: (historyLimit: number) => Promise<void>;
  startGeneration: ReturnType<typeof useGenerationTransport>['startGeneration'];
  cancelJob: ReturnType<typeof useGenerationTransport>['cancelJob'];
  deleteResult: ReturnType<typeof useGenerationTransport>['deleteResult'];
  reconnect: () => void;
  setPollInterval: (interval: number) => void;
  clear: () => void;
}

export const createGenerationTransportAdapter = (
  options: GenerationTransportAdapterOptions,
): GenerationTransportAdapter => {
  const transport = useGenerationTransport(
    {
      getBackendUrl: options.getBackendUrl,
      queueClient: options.queueClient,
      websocketManager: options.websocketManager,
      pollIntervalMs: options.initialPollInterval,
      logger: (...args: unknown[]) => {
        options.notificationAdapter.debug?.(...args);
      },
    },
    {
      onSystemStatus: (payload) => {
        options.onSystemStatus(payload);
      },
      onQueueUpdate: (jobs) => {
        options.onQueueUpdate(jobs);
      },
      onProgress: (message) => {
        options.onProgress(message);
      },
      onComplete: (message) => options.onComplete(message),
      onError: (message) => {
        options.onError(message);
      },
      onRecentResults: (results) => {
        options.onRecentResults(results);
      },
      onConnectionChange: (connected, snapshot) => {
        options.onConnectionChange(connected, snapshot);
      },
      onConnectionStateChange: (snapshot) => {
        options.onConnectionStateChange?.(snapshot);
      },
      onTransportError: (error) => {
        options.onTransportError?.(error);
      },
      shouldPollQueue: () => options.shouldPollQueue(),
      onNotify: (message, type = 'info') => {
        options.notificationAdapter.notify(message, type);
      },
      logger: (...args: unknown[]) => {
        options.notificationAdapter.debug?.(...args);
      },
      onHydrateSystemStatus: () => options.onHydrateSystemStatus(),
      onReleaseSystemStatus: () => options.onReleaseSystemStatus(),
    },
  );

  return {
    initialize: (historyLimit: number) => transport.initializeUpdates(historyLimit),
    refreshSystemStatus: () => transport.refreshSystemStatus(),
    refreshActiveJobs: () => transport.refreshActiveJobs(),
    refreshRecentResults: (historyLimit: number, notifySuccess?: boolean) =>
      transport.refreshRecentResults(historyLimit, notifySuccess),
    refreshAll: (historyLimit: number) => transport.refreshAllData(historyLimit),
    startGeneration: transport.startGeneration,
    cancelJob: transport.cancelJob,
    deleteResult: transport.deleteResult,
    reconnect: () => transport.reconnectUpdates(),
    setPollInterval: (interval: number) => transport.setPollInterval(interval),
    clear: () => {
      transport.clear();
    },
  };
};

export type { GenerationTransportAdapter };
