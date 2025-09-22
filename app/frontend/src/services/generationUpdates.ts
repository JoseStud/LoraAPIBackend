import { resolveBackendUrl, resolveGenerationBaseUrl } from '@/services/generationService';
import type { GenerationStore } from '@/stores/generation';
import { requestJson } from '@/utils/api';
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationJob,
  GenerationProgressMessage,
  GenerationResult,
  GenerationSystemStatusMessage,
  SystemStatusPayload,
  WebSocketMessage,
} from '@/types';

const DEFAULT_POLL_INTERVAL = 2000;
const RECONNECT_DELAY = 3000;

const withCredentials = (init: RequestInit = {}): RequestInit => ({
  credentials: 'same-origin',
  ...init,
});

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

const ensureArray = <T>(value: unknown): T[] => (Array.isArray(value) ? value : []);

const extractErrorMessage = (message: GenerationErrorMessage): string => {
  if (typeof message.error === 'string' && message.error.trim()) {
    return message.error;
  }
  if (typeof message.status === 'string' && message.status.trim()) {
    return message.status;
  }
  return 'Unknown error';
};

export interface GenerationUpdatesServiceOptions {
  store: GenerationStore;
  getBackendUrl: () => string | null | undefined;
  getHistoryLimit: () => number;
  logger?: (...args: unknown[]) => void;
  onGenerationComplete?: (result: GenerationResult) => void;
  onGenerationError?: (message: string, payload: GenerationErrorMessage) => void;
  onQueueUpdate?: (jobs: GenerationJob[]) => void;
  onConnectionChange?: (connected: boolean) => void;
  pollIntervalMs?: number;
}

export interface GenerationUpdatesService {
  start(): Promise<void>;
  stop(): void;
  reconnect(): void;
  refreshSystemStatus(): Promise<void>;
  refreshActiveJobs(): Promise<void>;
  refreshRecentResults(): Promise<void>;
}

export const createGenerationUpdatesService = (
  options: GenerationUpdatesServiceOptions,
): GenerationUpdatesService => {
  const {
    store,
    getBackendUrl,
    getHistoryLimit,
    logger,
    onGenerationComplete,
    onGenerationError,
    onQueueUpdate,
    onConnectionChange,
  } = options;

  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL;

  let websocket: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: number | null = null;
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
    store.setConnectionState(connected);
    if (typeof onConnectionChange === 'function') {
      onConnectionChange(connected);
    }
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

  const resolveBackend = (): string | null | undefined => getBackendUrl?.() ?? null;

  const buildUrl = (path: string): string => resolveBackendUrl(path, resolveBackend() ?? undefined);

  const refreshSystemStatus = async (): Promise<void> => {
    try {
      const result = await requestJson<SystemStatusPayload>(buildUrl('/system/status'), withCredentials());
      if (result.data) {
        store.applySystemStatusPayload(result.data);
      }
    } catch (error) {
      console.error('Failed to load system status:', error);
    }
  };

  const refreshActiveJobs = async (): Promise<void> => {
    try {
      const result = await requestJson<Partial<GenerationJob>[]>(
        buildUrl('/generation/jobs/active'),
        withCredentials(),
      );
      if (Array.isArray(result.data)) {
        store.setActiveJobs(result.data);
        if (typeof onQueueUpdate === 'function') {
          onQueueUpdate(store.activeJobs);
        }
      }
    } catch (error) {
      console.error('Failed to load active jobs:', error);
    }
  };

  const refreshRecentResults = async (): Promise<void> => {
    try {
      const limit = Math.max(1, Number(getHistoryLimit() ?? 0) || 0) || 10;
      const result = await requestJson<GenerationResult[]>(
        buildUrl(`/generation/results?limit=${limit}`),
        withCredentials(),
      );
      if (Array.isArray(result.data)) {
        store.setRecentResults(result.data);
      }
    } catch (error) {
      console.error('Failed to load recent results:', error);
    }
  };

  const handleGenerationComplete = (message: GenerationCompleteMessage): void => {
    const result = store.handleCompletionMessage(message);
    onGenerationComplete?.(result);
  };

  const handleGenerationError = (message: GenerationErrorMessage): void => {
    store.handleErrorMessage(message);
    const errorMessage = extractErrorMessage(message);
    onGenerationError?.(errorMessage, message);
  };

  const handleSystemStatusMessage = (message: GenerationSystemStatusMessage): void => {
    store.applySystemStatusPayload(message);
  };

  const handleQueueUpdate = (jobs: unknown): void => {
    const jobList = ensureArray<Partial<GenerationJob>>(jobs);
    store.ingestQueue(jobList);
    if (typeof onQueueUpdate === 'function') {
      onQueueUpdate(store.activeJobs);
    }
  };

  const handleProgress = (message: GenerationProgressMessage): void => {
    store.handleProgressMessage(message);
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
          handleProgress(payload as GenerationProgressMessage);
          break;
        case 'generation_complete':
          handleGenerationComplete(payload as GenerationCompleteMessage);
          break;
        case 'generation_error':
          handleGenerationError(payload as GenerationErrorMessage);
          break;
        case 'queue_update':
          handleQueueUpdate((payload as { jobs?: unknown }).jobs);
          break;
        case 'system_status':
          handleSystemStatusMessage(payload as GenerationSystemStatusMessage);
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
    const url = resolveWebSocketUrl(resolveBackend());

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

  const startPolling = (): void => {
    if (pollTimer || typeof window === 'undefined') {
      return;
    }

    pollTimer = window.setInterval(async () => {
      if (store.hasActiveJobs) {
        await refreshActiveJobs();
      }
      await refreshSystemStatus();
    }, pollIntervalMs);
  };

  const stopPolling = (): void => {
    if (pollTimer != null && typeof window !== 'undefined') {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const start = async (): Promise<void> => {
    shouldReconnect = true;
    await Promise.all([
      refreshSystemStatus(),
      refreshActiveJobs(),
      refreshRecentResults(),
    ]);
    connectWebSocket();
    startPolling();
  };

  const stop = (): void => {
    shouldReconnect = false;
    clearReconnectTimer();
    stopPolling();
    disconnectWebSocket();
  };

  const reconnect = (): void => {
    shouldReconnect = true;
    clearReconnectTimer();
    disconnectWebSocket();
    connectWebSocket();
  };

  return {
    start,
    stop,
    reconnect,
    refreshSystemStatus,
    refreshActiveJobs,
    refreshRecentResults,
  };
};
