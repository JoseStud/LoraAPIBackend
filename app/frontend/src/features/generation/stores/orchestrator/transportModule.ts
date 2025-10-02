/** @internal */
import { computed, readonly, ref } from 'vue';

import type { GenerationTransportAdapter } from '../../composables/createGenerationTransportAdapter';
import type {
  GenerationTransportError,
  GenerationTransportMetricsSnapshot,
  GenerationTransportPausePayload,
  GenerationTransportPauseReason,
  GenerationTransportPhase,
  GenerationTransportResumePayload,
  GenerationWebSocketStateSnapshot,
} from '../../types/transport';

const FREEZE = <T>(value: T): Readonly<T> => Object.freeze({ ...(value as Record<string, unknown>) }) as Readonly<T>;

const freezePausePayload = (
  payload: GenerationTransportPausePayload,
): GenerationTransportPausePayload =>
  Object.freeze({
    ...payload,
    reasons: Object.freeze([...payload.reasons]) as readonly GenerationTransportPauseReason[],
  }) as GenerationTransportPausePayload;

const freezeResumePayload = (
  payload: GenerationTransportResumePayload,
): GenerationTransportResumePayload => Object.freeze({ ...payload }) as GenerationTransportResumePayload;

const initialMetricsState = () => ({
  phase: 'idle' as GenerationTransportPhase,
  reconnectAttempt: 0,
  consecutiveFailures: 0,
  nextRetryDelayMs: null as number | null,
  lastConnectedAt: null as number | null,
  lastDisconnectedAt: null as number | null,
  downtimeMs: null as number | null,
  totalDowntimeMs: 0,
  lastError: null as GenerationTransportError | null,
  lastEvent: null as GenerationWebSocketStateSnapshot | null,
  paused: false,
  pauseReasons: Object.freeze([]) as readonly GenerationTransportPauseReason[],
  pauseSince: null as number | null,
  lastPauseEvent: null as GenerationTransportPausePayload | null,
  lastResumeEvent: null as GenerationTransportResumePayload | null,
});

export const createTransportModule = () => {
  const transport = ref<GenerationTransportAdapter | null>(null);
  const connectionSnapshot = ref<GenerationWebSocketStateSnapshot | null>(null);
  const phase = ref<GenerationTransportPhase>('idle');
  const reconnectAttempt = ref(0);
  const consecutiveFailures = ref(0);
  const nextRetryDelayMs = ref<number | null>(null);
  const lastConnectedAt = ref<number | null>(null);
  const lastDisconnectedAt = ref<number | null>(null);
  const downtimeMs = ref<number | null>(null);
  const totalDowntimeMs = ref(0);
  const lastError = ref<GenerationTransportError | null>(null);
  const paused = ref(false);
  const pauseReasons = ref<readonly GenerationTransportPauseReason[]>(
    initialMetricsState().pauseReasons,
  );
  const pauseSince = ref<number | null>(null);
  const lastPauseEvent = ref<GenerationTransportPausePayload | null>(null);
  const lastResumeEvent = ref<GenerationTransportResumePayload | null>(null);

  const ensureTransport = (): GenerationTransportAdapter => {
    const instance = transport.value;
    if (!instance) {
      throw new Error('Generation transport has not been initialized');
    }
    return instance;
  };

  const setTransport = (adapter: GenerationTransportAdapter): void => {
    transport.value = adapter;
  };

  const setPollInterval = (interval: number): void => {
    transport.value?.setPollInterval(interval);
  };

  const reconnect = (): void => {
    transport.value?.reconnect();
  };

  const recordTransportError = (error: GenerationTransportError): void => {
    lastError.value = Object.freeze({ ...error });
  };

  const applyPauseState = (payload: GenerationTransportPausePayload): GenerationTransportPausePayload => {
    const event = freezePausePayload(payload);
    paused.value = true;
    pauseReasons.value = event.reasons;
    pauseSince.value = event.timestamp;
    lastPauseEvent.value = event;
    phase.value = 'paused';
    return event;
  };

  const pauseTransport = (payload: GenerationTransportPausePayload): void => {
    const event = applyPauseState(payload);
    try {
      transport.value?.pause(event);
    } catch (error) {
      console.error('Failed to pause generation transport:', error);
    }
  };

  const resumeTransport = async (
    historyLimit: number,
    payload: GenerationTransportResumePayload,
  ): Promise<void> => {
    const event = freezeResumePayload(payload);
    const instance = transport.value;

    if (!instance) {
      paused.value = false;
      pauseReasons.value = initialMetricsState().pauseReasons;
      pauseSince.value = null;
      lastResumeEvent.value = event;
      lastPauseEvent.value = null;
      phase.value = 'connecting';
      return;
    }

    if (!paused.value && typeof instance.isPaused === 'function' && !instance.isPaused()) {
      lastResumeEvent.value = event;
      return;
    }

    phase.value = 'connecting';

    try {
      await instance.resume(historyLimit, payload);
      paused.value = false;
      pauseReasons.value = initialMetricsState().pauseReasons;
      pauseSince.value = null;
      lastResumeEvent.value = event;
      lastPauseEvent.value = null;
    } catch (error) {
      const lastEvent = lastPauseEvent.value;
      paused.value = true;
      pauseReasons.value = lastEvent?.reasons ?? pauseReasons.value;
      pauseSince.value = lastEvent?.timestamp ?? pauseSince.value ?? Date.now();
      phase.value = 'paused';
      throw error;
    }
  };

  const resetMetrics = (): void => {
    const base = initialMetricsState();
    phase.value = base.phase;
    reconnectAttempt.value = base.reconnectAttempt;
    consecutiveFailures.value = base.consecutiveFailures;
    nextRetryDelayMs.value = base.nextRetryDelayMs;
    lastConnectedAt.value = base.lastConnectedAt;
    lastDisconnectedAt.value = base.lastDisconnectedAt;
    downtimeMs.value = base.downtimeMs;
    totalDowntimeMs.value = base.totalDowntimeMs;
    lastError.value = base.lastError;
    connectionSnapshot.value = base.lastEvent;
    paused.value = base.paused;
    pauseReasons.value = base.pauseReasons;
    pauseSince.value = base.pauseSince;
    lastPauseEvent.value = base.lastPauseEvent;
    lastResumeEvent.value = base.lastResumeEvent;
  };

  const recordConnectionSnapshot = (snapshot: GenerationWebSocketStateSnapshot): void => {
    const frozenSnapshot = Object.freeze({ ...snapshot });
    connectionSnapshot.value = frozenSnapshot;
    reconnectAttempt.value = frozenSnapshot.reconnectAttempt;
    consecutiveFailures.value = frozenSnapshot.consecutiveFailures;
    nextRetryDelayMs.value = frozenSnapshot.nextRetryDelayMs;
    if (frozenSnapshot.lastConnectedAt != null) {
      lastConnectedAt.value = frozenSnapshot.lastConnectedAt;
    }
    if (frozenSnapshot.lastDisconnectedAt != null) {
      lastDisconnectedAt.value = frozenSnapshot.lastDisconnectedAt;
    }
    downtimeMs.value = frozenSnapshot.downtimeMs;
    if (frozenSnapshot.event === 'connect:success' && frozenSnapshot.downtimeMs != null) {
      totalDowntimeMs.value += frozenSnapshot.downtimeMs;
    }

    if (frozenSnapshot.error && frozenSnapshot.event !== 'connect:success') {
      recordTransportError({
        source: 'websocket',
        context: frozenSnapshot.event,
        message: frozenSnapshot.error.message,
        timestamp: frozenSnapshot.timestamp,
        statusCode: frozenSnapshot.error.code,
        attempt: frozenSnapshot.error.attempt ?? frozenSnapshot.reconnectAttempt,
        url: frozenSnapshot.url,
        details: frozenSnapshot.error,
      });
    }

    switch (frozenSnapshot.event) {
      case 'connect:start':
        phase.value = 'connecting';
        break;
      case 'reconnect:scheduled':
        phase.value = 'reconnecting';
        break;
      case 'connect:success':
        phase.value = 'connected';
        break;
      case 'disconnect':
        phase.value = 'disconnected';
        break;
      case 'error':
        phase.value = 'disconnected';
        break;
      default:
        break;
    }

    if (paused.value) {
      phase.value = 'paused';
    }
  };

  const clearTransport = (): void => {
    transport.value?.clear();
    transport.value = null;
    resetMetrics();
  };

  const withTransport = <T>(callback: (adapter: GenerationTransportAdapter) => T): T => {
    const instance = ensureTransport();
    return callback(instance);
  };

  const metrics = computed<GenerationTransportMetricsSnapshot>(() =>
    FREEZE({
      phase: phase.value,
      reconnectAttempt: reconnectAttempt.value,
      consecutiveFailures: consecutiveFailures.value,
      nextRetryDelayMs: nextRetryDelayMs.value,
      lastConnectedAt: lastConnectedAt.value,
      lastDisconnectedAt: lastDisconnectedAt.value,
      downtimeMs: downtimeMs.value,
      totalDowntimeMs: totalDowntimeMs.value,
      lastError: lastError.value,
      lastEvent: connectionSnapshot.value,
      paused: paused.value,
      pauseReasons: pauseReasons.value,
      pauseSince: pauseSince.value,
      lastPauseEvent: lastPauseEvent.value,
      lastResumeEvent: lastResumeEvent.value,
    }),
  );

  return {
    ensureTransport,
    setTransport,
    setPollInterval,
    reconnect,
    clearTransport,
    withTransport,
    recordConnectionSnapshot,
    recordTransportError,
    pauseTransport,
    resumeTransport,
    resetMetrics,
    metrics,
    phase: readonly(phase),
    reconnectAttempt: readonly(reconnectAttempt),
    consecutiveFailures: readonly(consecutiveFailures),
    nextRetryDelayMs: readonly(nextRetryDelayMs),
    lastConnectedAt: readonly(lastConnectedAt),
    lastDisconnectedAt: readonly(lastDisconnectedAt),
    downtimeMs: readonly(downtimeMs),
    totalDowntimeMs: readonly(totalDowntimeMs),
    lastError: readonly(lastError),
    lastSnapshot: readonly(connectionSnapshot),
    paused: readonly(paused),
    pauseReasons: readonly(pauseReasons),
    pauseSince: readonly(pauseSince),
    lastPauseEvent: readonly(lastPauseEvent),
    lastResumeEvent: readonly(lastResumeEvent),
  };
};

export type TransportModule = ReturnType<typeof createTransportModule>;
