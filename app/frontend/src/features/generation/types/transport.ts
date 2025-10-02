export type GenerationTransportPhase =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'paused';

export type GenerationTransportPauseReason = 'document-hidden' | 'network-offline';

export interface GenerationTransportPausePayload {
  reasons: readonly GenerationTransportPauseReason[];
  hidden: boolean;
  online: boolean;
  source: string;
  timestamp: number;
}

export interface GenerationTransportResumePayload {
  hidden: boolean;
  online: boolean;
  source: string;
  timestamp: number;
}

export type GenerationWebSocketEventName =
  | 'connect:start'
  | 'connect:success'
  | 'disconnect'
  | 'reconnect:scheduled'
  | 'error';

export interface GenerationWebSocketErrorDetails {
  message: string;
  code?: number;
  reason?: string;
  wasClean?: boolean;
  attempt?: number;
  cause?: unknown;
}

export interface GenerationWebSocketStateSnapshot {
  event: GenerationWebSocketEventName;
  timestamp: number;
  url: string;
  connected: boolean;
  reconnectAttempt: number;
  consecutiveFailures: number;
  nextRetryDelayMs: number | null;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  downtimeMs: number | null;
  error: GenerationWebSocketErrorDetails | null;
}

export interface GenerationTransportError {
  source: 'websocket' | 'http';
  context: string;
  message: string;
  timestamp: number;
  statusCode?: number;
  attempt?: number;
  url?: string;
  details?: unknown;
}

export interface GenerationTransportMetricsSnapshot {
  phase: GenerationTransportPhase;
  reconnectAttempt: number;
  consecutiveFailures: number;
  nextRetryDelayMs: number | null;
  lastConnectedAt: number | null;
  lastDisconnectedAt: number | null;
  downtimeMs: number | null;
  totalDowntimeMs: number;
  lastError: GenerationTransportError | null;
  lastEvent: GenerationWebSocketStateSnapshot | null;
  paused: boolean;
  pauseReasons: readonly GenerationTransportPauseReason[];
  pauseSince: number | null;
  lastPauseEvent: GenerationTransportPausePayload | null;
  lastResumeEvent: GenerationTransportResumePayload | null;
}
