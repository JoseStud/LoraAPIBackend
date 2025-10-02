import { describe, expect, it, vi } from 'vitest';
import { computed } from 'vue';

import {
  createGenerationFacade,
  type GenerationHistoryRefreshOptions,
  type GenerationManager,
  type GenerationHistoryLimit,
  type ImmutableGenerationJob,
  type ImmutableGenerationResult,
} from '@/features/generation/orchestrator';
import type { DeepReadonly } from '@/utils/freezeDeep';
import type { SystemStatusState } from '@/types';
import type {
  GenerationTransportError,
  GenerationTransportMetricsSnapshot,
  GenerationTransportPhase,
  GenerationWebSocketStateSnapshot,
} from '@/features/generation/types/transport';

const systemStatus: DeepReadonly<SystemStatusState> = Object.freeze({
  gpu_available: false,
  queue_length: 0,
  status: 'unknown',
  gpu_status: 'Unknown',
  memory_used: 0,
  memory_total: 0,
});

const transportMetrics: GenerationTransportMetricsSnapshot = {
  phase: 'idle',
  reconnectAttempt: 0,
  consecutiveFailures: 0,
  nextRetryDelayMs: null,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  downtimeMs: null,
  totalDowntimeMs: 0,
  lastError: null,
  lastEvent: null,
};

const createManagerStub = () => {
  const cancelJob = vi.fn(async (_jobId: string) => {});
  const removeJob = vi.fn((_jobId: string | number) => {});
  const cancelJobByBackendId = vi.fn(async (_jobId: string) => {});
  const removeJobLocal = vi.fn((_jobId: string) => {});
  const refreshHistory = vi.fn(async (_options?: GenerationHistoryRefreshOptions) => {});
  const setHistoryLimit = vi.fn((_limit: GenerationHistoryLimit) => {});
  const reconnect = vi.fn(() => {});

  const manager: GenerationManager = {
    jobs: computed<readonly ImmutableGenerationJob[]>(() => []),
    activeJobs: computed<readonly ImmutableGenerationJob[]>(() => []),
    sortedActiveJobs: computed<readonly ImmutableGenerationJob[]>(() => []),
    hasActiveJobs: computed(() => false),
    recentResults: computed<readonly ImmutableGenerationResult[]>(() => []),
    historyLimit: computed<GenerationHistoryLimit>(() => 10),
    systemStatus: computed(() => systemStatus),
    systemStatusReady: computed(() => true),
    systemStatusLastUpdated: computed(() => null),
    systemStatusApiAvailable: computed(() => true),
    queueManagerActive: computed(() => true),
    isActive: computed(() => true),
    isConnected: computed(() => true),
    pollIntervalMs: computed(() => 1_000),
    transportMetrics: computed(() => transportMetrics),
    transportPhase: computed<GenerationTransportPhase>(() => transportMetrics.phase),
    transportReconnectAttempt: computed(() => transportMetrics.reconnectAttempt),
    transportConsecutiveFailures: computed(() => transportMetrics.consecutiveFailures),
    transportNextRetryDelayMs: computed(() => transportMetrics.nextRetryDelayMs),
    transportLastConnectedAt: computed(() => transportMetrics.lastConnectedAt),
    transportLastDisconnectedAt: computed(() => transportMetrics.lastDisconnectedAt),
    transportDowntimeMs: computed(() => transportMetrics.downtimeMs),
    transportTotalDowntimeMs: computed(() => transportMetrics.totalDowntimeMs),
    lastError: computed<GenerationTransportError | null>(() => transportMetrics.lastError),
    lastSnapshot: computed<GenerationWebSocketStateSnapshot | null>(
      () => transportMetrics.lastEvent,
    ),
    cancelJob,
    cancelJobByBackendId,
    removeJob,
    removeJobLocal,
    refreshHistory,
    reconnect,
    setHistoryLimit,
  };

  return {
    manager,
    cancelJob,
    cancelJobByBackendId,
    removeJob,
    removeJobLocal,
    refreshHistory,
    reconnect,
    setHistoryLimit,
  };
};

describe('createGenerationFacade', () => {
  it('forwards cancelJob to the manager', async () => {
    const { manager, cancelJob } = createManagerStub();
    const facade = createGenerationFacade({ manager });

    await facade.cancelJob('job-1');

    expect(cancelJob).toHaveBeenCalledWith('job-1');
  });

  it('forwards removeJob to the manager', () => {
    const { manager, removeJob } = createManagerStub();
    const facade = createGenerationFacade({ manager });

    facade.removeJob(42);

    expect(removeJob).toHaveBeenCalledWith(42);
  });

  it('forwards refreshHistory options to the manager', async () => {
    const { manager, refreshHistory } = createManagerStub();
    const facade = createGenerationFacade({ manager });
    const options: GenerationHistoryRefreshOptions = { notifySuccess: true };

    await facade.refreshHistory(options);

    expect(refreshHistory).toHaveBeenCalledWith(options);
  });

  it('forwards reconnect to the manager', () => {
    const { manager, reconnect } = createManagerStub();
    const facade = createGenerationFacade({ manager });

    facade.reconnect();

    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('forwards setHistoryLimit to the manager', () => {
    const { manager, setHistoryLimit } = createManagerStub();
    const facade = createGenerationFacade({ manager });

    facade.setHistoryLimit(25);

    expect(setHistoryLimit).toHaveBeenCalledWith(25);
  });
});
