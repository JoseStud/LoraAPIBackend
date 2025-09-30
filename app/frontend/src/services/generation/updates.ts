import {
  cancelGenerationJob,
  deleteGenerationResult,
  resolveBackendUrl,
  resolveGenerationBaseUrl,
  resolveGenerationRoute,
  startGeneration,
} from './generationService';
import { requestJson } from '@/services/apiClient';
import { normalizeJobStatus } from '@/utils/status';
import { withSameOrigin } from '@/utils/backend';

import {
  GenerationJobStatusSchema,
  GenerationResultSchema,
  SystemStatusPayloadSchema,
} from '@/schemas';

import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationJob,
  GenerationJobStatus,
  GenerationProgressMessage,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  GenerationSystemStatusMessage,
  SystemStatusPayload,
  WebSocketMessage,
} from '@/types';
import {
  ensureArray,
  logValidationIssues,
  parseGenerationJobStatuses,
  parseGenerationResults,
} from './validation';

const DEFAULT_POLL_INTERVAL = 2000;
const RECONNECT_DELAY = 3000;

const appendWebSocketPath = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '');
  if (trimmed) {
    return `${trimmed}/ws/progress`;
  }
  return '/api/v1/ws/progress';
};

const resolveWebSocketUrl = (backendUrl?: string | null): string => {
  const base = resolveGenerationBaseUrl(backendUrl ?? undefined);

  if (/^https?:\/\//i.test(base)) {
    try {
      const url = new URL(base);
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${url.host}${appendWebSocketPath(url.pathname)}`;
    } catch (error) {
      console.error('Failed to parse backend URL for WebSocket:', error);
    }
  }

  const wsPath = appendWebSocketPath(base);

  if (typeof window === 'undefined') {
    return wsPath;
  }

  const normalizedPath = wsPath.startsWith('/') ? wsPath : `/${wsPath}`;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${normalizedPath}`;
};

export const extractGenerationErrorMessage = (message: GenerationErrorMessage): string => {
  if (typeof message.error === 'string' && message.error.trim()) {
    return message.error;
  }
  if (typeof message.status === 'string' && message.status.trim()) {
    return message.status;
  }
  return 'Unknown error';
};

export interface GenerationQueueClientOptions {
  getBackendUrl: () => string | null | undefined;
}

export interface GenerationQueueClient {
  startGeneration(payload: GenerationRequestPayload): Promise<GenerationStartResponse>;
  cancelJob(jobId: string): Promise<void>;
  deleteResult(resultId: string | number): Promise<void>;
  fetchSystemStatus(): Promise<SystemStatusPayload | null>;
  fetchActiveJobs(): Promise<GenerationJobStatus[]>;
  fetchRecentResults(limit: number): Promise<GenerationResult[]>;
}

export const createGenerationQueueClient = (
  options: GenerationQueueClientOptions,
): GenerationQueueClient => {
  const resolveBackend = () => options.getBackendUrl?.() ?? null;

  const buildUrl = (path: string): string => resolveBackendUrl(path, resolveBackend() ?? undefined);

  const buildGenerationUrl = (path: string): string =>
    resolveGenerationRoute(path, resolveBackend() ?? undefined);

  const fetchSystemStatus = async (): Promise<SystemStatusPayload | null> => {
    try {
      const result = await requestJson<unknown>(buildUrl('/system/status'), withSameOrigin());
      if (result.data == null) {
        return null;
      }
      const parsed = SystemStatusPayloadSchema.safeParse(result.data);
      if (parsed.success) {
        return parsed.data;
      }
      logValidationIssues('system status', parsed.error, result.data);
      return null;
    } catch (error) {
      console.error('Failed to load system status:', error);
      throw error;
    }
  };

  const fetchActiveJobs = async (): Promise<GenerationJobStatus[]> => {
    try {
      const result = await requestJson<unknown>(
        buildGenerationUrl('jobs/active'),
        withSameOrigin(),
      );
      const parsed = parseGenerationJobStatuses(result.data, 'active job');
      return parsed.map((status) => ({
        ...status,
        status: normalizeJobStatus(status.status),
      }));
    } catch (error) {
      console.error('Failed to load active jobs:', error);
      throw error;
    }
  };

  const fetchRecentResults = async (limit: number): Promise<GenerationResult[]> => {
    const normalizedLimit = Math.max(1, Number(limit) || 1);
    try {
      const result = await requestJson<unknown>(
        buildGenerationUrl(`results?limit=${normalizedLimit}`),
        withSameOrigin(),
      );
      return parseGenerationResults(result.data, 'recent result');
    } catch (error) {
      console.error('Failed to load recent results:', error);
      throw error;
    }
  };

  return {
    startGeneration: async (payload: GenerationRequestPayload) =>
      startGeneration(payload, resolveBackend() ?? undefined),
    cancelJob: async (jobId: string) => {
      await cancelGenerationJob(jobId, resolveBackend() ?? undefined);
    },
    deleteResult: async (resultId: string | number) => {
      await deleteGenerationResult(resultId, resolveBackend() ?? undefined);
    },
    fetchSystemStatus,
    fetchActiveJobs,
    fetchRecentResults,
  };
};

export interface GenerationWebSocketManagerOptions {
  getBackendUrl: () => string | null | undefined;
  logger?: (...args: unknown[]) => void;
  onProgress?: (message: GenerationProgressMessage) => void;
  onComplete?: (message: GenerationCompleteMessage) => void;
  onError?: (message: GenerationErrorMessage) => void;
  onQueueUpdate?: (jobs: unknown) => void;
  onSystemStatus?: (message: GenerationSystemStatusMessage) => void;
  onConnectionChange?: (connected: boolean) => void;
}

export interface GenerationWebSocketManager {
  start(): void;
  stop(): void;
  reconnect(): void;
}

export const createGenerationWebSocketManager = (
  options: GenerationWebSocketManagerOptions,
): GenerationWebSocketManager => {
  const { getBackendUrl, logger } = options;

  let websocket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let shouldReconnect = true;

  const logDebug = (...args: unknown[]) => {
    if (typeof logger === 'function') {
      logger(...args);
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const notifyConnectionChange = (connected: boolean) => {
    options.onConnectionChange?.(connected);
    logDebug('WebSocket connection state changed:', connected);
  };

  const scheduleReconnect = () => {
    if (!shouldReconnect || reconnectTimer != null) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!shouldReconnect || websocket) {
        return;
      }
      logDebug('Attempting to reconnect WebSocket...');
      connectWebSocket();
    }, RECONNECT_DELAY);
  };

  const handleQueueUpdate = (jobs: unknown): void => {
    const jobList = ensureArray<Partial<GenerationJob>>(jobs);
    options.onQueueUpdate?.(jobList);
  };

  const handleWebSocketMessage = (event: MessageEvent): void => {
    try {
      const payload = JSON.parse(event.data as string) as WebSocketMessage;
      if (!payload || typeof payload !== 'object') {
        logDebug('Received invalid WebSocket message:', payload);
        return;
      }

      switch (payload.type) {
        case 'generation_progress':
          options.onProgress?.(payload as GenerationProgressMessage);
          break;
        case 'generation_complete':
          options.onComplete?.(payload as GenerationCompleteMessage);
          break;
        case 'generation_error':
          options.onError?.(payload as GenerationErrorMessage);
          break;
        case 'queue_update':
          handleQueueUpdate((payload as { jobs?: unknown }).jobs);
          break;
        case 'system_status':
          options.onSystemStatus?.(payload as GenerationSystemStatusMessage);
          break;
        case 'generation_started':
          logDebug('Generation job started', (payload as { job_id?: string }).job_id);
          break;
        default:
          logDebug('Unknown WebSocket message type:', (payload as { type?: string }).type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  };

  const connectWebSocket = (): void => {
    const url = resolveWebSocketUrl(getBackendUrl?.());

    try {
      if (websocket) {
        websocket.onclose = null;
        websocket.close();
      }

      websocket = new WebSocket(url);
      clearReconnectTimer();

      websocket.onopen = () => {
        notifyConnectionChange(true);
        logDebug('WebSocket connected for generation updates');
      };

      websocket.onmessage = handleWebSocketMessage;

      websocket.onerror = (event) => {
        console.error('WebSocket error:', event);
      };

      websocket.onclose = () => {
        if (websocket) {
          websocket.onmessage = null;
          websocket.onerror = null;
          websocket.onclose = null;
          websocket = null;
        }
        notifyConnectionChange(false);
        scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      notifyConnectionChange(false);
      scheduleReconnect();
    }
  };

  const disconnectWebSocket = (): void => {
    if (websocket) {
      websocket.onclose = null;
      try {
        websocket.close();
      } catch (error) {
        console.error('Failed to close WebSocket connection:', error);
      }
      websocket = null;
    }
    notifyConnectionChange(false);
  };

  return {
    start: () => {
      shouldReconnect = true;
      connectWebSocket();
    },
    stop: () => {
      shouldReconnect = false;
      clearReconnectTimer();
      disconnectWebSocket();
    },
    reconnect: () => {
      shouldReconnect = true;
      clearReconnectTimer();
      disconnectWebSocket();
      connectWebSocket();
    },
  };
};

export { DEFAULT_POLL_INTERVAL };
