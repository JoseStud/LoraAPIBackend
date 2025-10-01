import { generationPollingConfig } from '../config/polling';
import { resolveGenerationBaseUrl } from './generationService';
import { ensureArray } from './validation';
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationJob,
  GenerationProgressMessage,
  GenerationSystemStatusMessage,
  WebSocketMessage,
} from '@/types';
import type {
  GenerationTransportError,
  GenerationWebSocketErrorDetails,
  GenerationWebSocketStateSnapshot,
} from '../types/transport';

const RECONNECT_DELAY = generationPollingConfig.websocketRetryMs;
const MAX_RECONNECT_DELAY = Math.min(60_000, RECONNECT_DELAY * 8);
const BACKOFF_FACTOR = 2;

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

export interface GenerationWebSocketManagerOptions {
  getBackendUrl: () => string | null | undefined;
  logger?: (...args: unknown[]) => void;
  onProgress?: (message: GenerationProgressMessage) => void;
  onComplete?: (message: GenerationCompleteMessage) => void;
  onError?: (message: GenerationErrorMessage) => void;
  onQueueUpdate?: (jobs: unknown) => void;
  onSystemStatus?: (message: GenerationSystemStatusMessage) => void;
  onConnectionChange?: (connected: boolean, snapshot?: GenerationWebSocketStateSnapshot) => void;
  onStateChange?: (snapshot: GenerationWebSocketStateSnapshot) => void;
  onTransportError?: (error: GenerationTransportError) => void;
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
  let reconnectAttempt = 0;
  let consecutiveFailures = 0;
  let lastConnectedAt: number | null = null;
  let lastDisconnectedAt: number | null = null;
  let downtimeStartAt: number | null = null;
  let nextRetryDelayMs: number | null = null;
  let lastKnownUrl = '';
  let lastError: GenerationWebSocketErrorDetails | null = null;

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

  const emitState = (
    event: GenerationWebSocketStateSnapshot['event'],
    overrides: Partial<GenerationWebSocketStateSnapshot> = {},
  ): GenerationWebSocketStateSnapshot => {
    const snapshot: GenerationWebSocketStateSnapshot = {
      event,
      timestamp: Date.now(),
      url: lastKnownUrl,
      connected: overrides.connected ?? (event === 'connect:success'),
      reconnectAttempt,
      consecutiveFailures,
      nextRetryDelayMs,
      lastConnectedAt,
      lastDisconnectedAt,
      downtimeMs: downtimeStartAt != null ? Date.now() - downtimeStartAt : null,
      error: lastError,
      ...overrides,
    };

    try {
      options.onStateChange?.(snapshot);
    } catch (error) {
      console.error('Failed to notify WebSocket state change:', error);
    }

    logDebug('[generation:websocket]', snapshot);

    return snapshot;
  };

  const reportTransportError = (
    context: string,
    errorDetails: GenerationWebSocketErrorDetails,
  ): void => {
    lastError = { ...errorDetails };
    const payload: GenerationTransportError = {
      source: 'websocket',
      context,
      message: errorDetails.message,
      timestamp: Date.now(),
      statusCode: errorDetails.code,
      attempt: reconnectAttempt,
      url: lastKnownUrl,
      details: errorDetails,
    };
    try {
      options.onTransportError?.(payload);
    } catch (notifyError) {
      console.error('Failed to notify WebSocket transport error:', notifyError);
    }
  };

  const notifyConnectionChange = (
    connected: boolean,
    snapshot?: GenerationWebSocketStateSnapshot,
  ): void => {
    const resolved = snapshot
      ?? emitState(connected ? 'connect:success' : 'disconnect', {
        connected,
      });

    try {
      options.onConnectionChange?.(connected, resolved);
    } catch (error) {
      console.error('Failed to notify WebSocket connection change:', error);
    }
  };

  const scheduleReconnect = () => {
    if (!shouldReconnect || reconnectTimer != null) {
      return;
    }
    reconnectAttempt += 1;
    consecutiveFailures = Math.max(consecutiveFailures, reconnectAttempt);
    const computedDelay = Math.min(
      Math.floor(RECONNECT_DELAY * Math.pow(BACKOFF_FACTOR, reconnectAttempt - 1)),
      MAX_RECONNECT_DELAY,
    );
    nextRetryDelayMs = computedDelay;

    emitState('reconnect:scheduled', {
      connected: false,
      error: lastError,
      nextRetryDelayMs: computedDelay,
    });

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (!shouldReconnect || websocket) {
        return;
      }
      logDebug('Attempting to reconnect WebSocket...', reconnectAttempt);
      connectWebSocket();
    }, computedDelay);
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
    lastKnownUrl = url;

    emitState('connect:start', {
      connected: false,
      error: lastError,
    });

    try {
      if (websocket) {
        websocket.onclose = null;
        websocket.close();
      }

      websocket = new WebSocket(url);
      clearReconnectTimer();

      websocket.onopen = () => {
        const now = Date.now();
        lastConnectedAt = now;
        const snapshot = emitState('connect:success', {
          connected: true,
          downtimeMs: downtimeStartAt != null ? now - downtimeStartAt : null,
        });
        reconnectAttempt = 0;
        consecutiveFailures = 0;
        downtimeStartAt = null;
        nextRetryDelayMs = null;
        lastError = null;
        notifyConnectionChange(true, snapshot);
        logDebug('WebSocket connected for generation updates');
      };

      websocket.onmessage = handleWebSocketMessage;

      websocket.onerror = (event) => {
        const details: GenerationWebSocketErrorDetails = {
          message: 'WebSocket error event',
          cause: event,
          attempt: reconnectAttempt,
        };
        reportTransportError('websocket:error', details);
        emitState('error', {
          connected: false,
          error: details,
        });
        console.error('WebSocket error:', event);
      };

      websocket.onclose = (event) => {
        if (websocket) {
          websocket.onmessage = null;
          websocket.onerror = null;
          websocket.onclose = null;
          websocket = null;
        }
        const closeEvent = event as CloseEvent | undefined;
        const message = closeEvent?.reason || 'WebSocket connection closed';
        lastDisconnectedAt = Date.now();
        if (downtimeStartAt == null) {
          downtimeStartAt = lastDisconnectedAt;
        }
        const details: GenerationWebSocketErrorDetails = {
          message,
          code: closeEvent?.code,
          reason: closeEvent?.reason,
          wasClean: closeEvent?.wasClean,
          attempt: reconnectAttempt,
        };
        lastError = details;
        reportTransportError('websocket:close', details);
        const snapshot = emitState('disconnect', {
          connected: false,
          error: details,
        });
        notifyConnectionChange(false, snapshot);
        scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      const message = error instanceof Error ? error.message : 'Unknown WebSocket error';
      const details: GenerationWebSocketErrorDetails = {
        message,
        cause: error,
        attempt: reconnectAttempt,
      };
      reportTransportError('websocket:init', details);
      if (downtimeStartAt == null) {
        downtimeStartAt = Date.now();
      }
      const snapshot = emitState('error', {
        connected: false,
        error: details,
      });
      notifyConnectionChange(false, snapshot);
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
    downtimeStartAt = null;
    lastError = null;
    notifyConnectionChange(false);
  };

  return {
    start: () => {
      shouldReconnect = true;
      reconnectAttempt = 0;
      consecutiveFailures = 0;
      nextRetryDelayMs = null;
      downtimeStartAt = null;
      lastError = null;
      connectWebSocket();
    },
    stop: () => {
      shouldReconnect = false;
      clearReconnectTimer();
      disconnectWebSocket();
      reconnectAttempt = 0;
      nextRetryDelayMs = null;
      downtimeStartAt = null;
    },
    reconnect: () => {
      shouldReconnect = true;
      clearReconnectTimer();
      disconnectWebSocket();
      reconnectAttempt = 0;
      nextRetryDelayMs = null;
      connectWebSocket();
    },
  };
};

