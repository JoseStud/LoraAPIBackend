/**
 * @internal
 *
 * Transport side of the orchestrator store:
 * - `createTransportModule` holds the active transport adapter and its connection, retry, pause and
 *   error telemetry;
 * - `createTransportActions` implements the store's data-loading and queue commands on top of it;
 * - `createAdapterHandlers` routes the adapter's callbacks into the queue, results and
 *   system-status modules.
 *
 * None of these start timers, watchers or listeners; the adapter (`transportAdapter.ts`) does that
 * only when the store's lifecycle methods tell it to.
 */
import { computed, readonly, ref } from 'vue';

import type { GenerationTransportAdapter } from './transportAdapter';
import type { QueueModule } from './queueModule';
import type { ResultsModule } from './resultsModule';
import type { SystemStatusModule } from './systemStatusModule';
import type { GenerationRequestPayload, GenerationStartResponse } from '@/types';
import { normalizeJobStatus } from '@/utils/status';
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

export interface TransportActionDependencies {
  queue: QueueModule;
  results: ResultsModule;
  transport: TransportModule;
}

export const createTransportActions = ({
  queue,
  results,
  transport,
}: TransportActionDependencies) => {
  const ensureTransport = () => transport.ensureTransport();

  const loadSystemStatusData = async (): Promise<void> => {
    await transport.withTransport((instance) => instance.refreshSystemStatus());
  };

  const loadActiveJobsData = async (): Promise<void> => {
    await transport.withTransport((instance) => instance.refreshActiveJobs());
  };

  const loadRecentResults = async (notifySuccess = false): Promise<void> => {
    await transport.withTransport((instance) =>
      instance.refreshRecentResults(results.historyLimit.value, notifySuccess),
    );
  };

  const refreshAllData = async (): Promise<void> => {
    await transport.withTransport((instance) =>
      instance.refreshAll(results.historyLimit.value),
    );
  };

  const handleBackendUrlChange = async (): Promise<void> => {
    transport.reconnect();
    await refreshAllData();
  };

  const reconnect = (): void => {
    transport.reconnect();
  };

  const startGeneration = async (
    payload: GenerationRequestPayload,
  ): Promise<GenerationStartResponse> => {
    const adapter = ensureTransport();
    const response = await adapter.startGeneration(payload);

    if (response.job_id) {
      const createdAt = new Date().toISOString();
      queue.enqueueJob({
        id: response.job_id,
        uiId: response.job_id,
        backendId: response.job_id,
        prompt: payload.prompt,
        status: normalizeJobStatus(response.status),
        progress: response.progress ?? 0,
        startTime: createdAt,
        created_at: createdAt,
        width: payload.width,
        height: payload.height,
        steps: payload.steps,
        total_steps: payload.steps,
        cfg_scale: payload.cfg_scale,
        seed: payload.seed,
      });
    }

    return response;
  };

  const cancelJob = async (jobId: string): Promise<void> => {
    const adapter = ensureTransport();
    const normalizedId = typeof jobId === 'string' ? jobId : String(jobId);
    const job = queue.getJobByIdentifier(normalizedId);
    const backendJobId = job?.backendId ?? normalizedId;

    await adapter.cancelJob(backendJobId);
    queue.removeJob(backendJobId);
  };

  const clearQueue = async (): Promise<void> => {
    const cancellableJobs = queue.getCancellableJobs();
    if (cancellableJobs.length === 0) {
      return;
    }

    await Promise.allSettled(cancellableJobs.map((job) => cancelJob(job.backendId)));
  };

  const deleteResult = async (resultId: string | number): Promise<void> => {
    const adapter = ensureTransport();
    await adapter.deleteResult(resultId);
    results.removeResult(resultId);
  };

  return {
    loadSystemStatusData,
    loadActiveJobsData,
    loadRecentResults,
    refreshAllData,
    handleBackendUrlChange,
    reconnect,
    startGeneration,
    cancelJob,
    clearQueue,
    deleteResult,
  };
};

export type TransportActions = ReturnType<typeof createTransportActions>;

export interface AdapterHandlerDependencies {
  queue: Pick<
    QueueModule,
    | 'ingestQueue'
    | 'jobsByBackendId'
    | 'handleProgressMessage'
    | 'handleCompletionMessage'
    | 'handleErrorMessage'
  >;
  results: Pick<ResultsModule, 'setResults'>;
  systemStatus: Pick<SystemStatusModule, 'applySystemStatusPayload' | 'setConnectionState'>;
  /**
   * Called with the backend ids of jobs whose results are now available: on a
   * WebSocket completion, or when a job leaves the active-jobs feed.
   */
  onJobsFinished?: (jobIds: string[]) => void;
}

export interface AdapterHandlers {
  onSystemStatus: SystemStatusModule['applySystemStatusPayload'];
  onQueueUpdate: QueueModule['ingestQueue'];
  onProgress: QueueModule['handleProgressMessage'];
  onComplete: QueueModule['handleCompletionMessage'];
  onError: QueueModule['handleErrorMessage'];
  onRecentResults: ResultsModule['setResults'];
  onConnectionChange: SystemStatusModule['setConnectionState'];
}

export const createAdapterHandlers = ({
  queue,
  results,
  systemStatus,
  onJobsFinished,
}: AdapterHandlerDependencies): AdapterHandlers => {
  // The active-jobs feed drops a job once it completes or fails, which is the
  // signal (without WebSocket completion events) that its result is available.
  const handleQueueUpdate: AdapterHandlers['onQueueUpdate'] = (list) => {
    const before = [...queue.jobsByBackendId.value.keys()];
    queue.ingestQueue(list);
    const after = queue.jobsByBackendId.value;
    const finished = before.filter((id) => !after.has(id));
    if (finished.length > 0) {
      onJobsFinished?.(finished);
    }
  };

  // The completion message carries no prompt or image settings, so the stored
  // result is fetched instead. Removing the job here also means the feed check
  // above will not report it a second time.
  const handleCompletion: AdapterHandlers['onComplete'] = (message) => {
    queue.handleCompletionMessage(message);
    onJobsFinished?.([String(message.job_id)]);
  };

  return {
    onSystemStatus: systemStatus.applySystemStatusPayload,
    onQueueUpdate: handleQueueUpdate,
    onProgress: queue.handleProgressMessage,
    onComplete: handleCompletion,
    onError: queue.handleErrorMessage,
    onRecentResults: results.setResults,
    onConnectionChange: systemStatus.setConnectionState,
  };
};
