/** @internal */
import { reactive, readonly, ref } from 'vue';

import { generationPollingConfig } from '../../config/polling';
import type { SystemStatusPayload, SystemStatusState } from '@/types';

const DEFAULT_POLL_INTERVAL = generationPollingConfig.defaults.systemStatusMs;

export const DEFAULT_SYSTEM_STATUS: SystemStatusState = {
  gpu_available: false,
  queue_length: 0,
  status: 'unknown',
  gpu_status: 'Unknown',
  memory_used: 0,
  memory_total: 0,
};

export const createDefaultSystemStatus = (): SystemStatusState => ({
  ...DEFAULT_SYSTEM_STATUS,
});

export interface SystemStatusModuleOptions {
  onPollIntervalChange?: (next: number) => void;
}

const toPollInterval = (interval: number): number => {
  const numeric = Math.floor(Number(interval));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_POLL_INTERVAL;
};

export const createSystemStatusModule = (options: SystemStatusModuleOptions = {}) => {
  const systemStatusState = reactive<SystemStatusState>(createDefaultSystemStatus());
  const isConnected = ref(false);
  const pollIntervalMs = ref(DEFAULT_POLL_INTERVAL);
  const systemStatusReady = ref(false);
  const systemStatusLastUpdated = ref<Date | null>(null);
  const systemStatusApiAvailable = ref(true);
  const queueManagerActive = ref(false);
  const systemStatus = readonly(systemStatusState);
  const pollIntervalState = readonly(pollIntervalMs);
  const isConnectedState = readonly(isConnected);
  const systemStatusReadyState = readonly(systemStatusReady);
  const systemStatusLastUpdatedState = readonly(systemStatusLastUpdated);
  const systemStatusApiAvailableState = readonly(systemStatusApiAvailable);
  const queueManagerActiveState = readonly(queueManagerActive);

  const setConnectionState = (connected: boolean): void => {
    isConnected.value = connected;
  };

  const setPollInterval = (interval: number): void => {
    const next = toPollInterval(interval);
    pollIntervalMs.value = next;
    options.onPollIntervalChange?.(next);
  };

  const updateSystemStatus = (status: Partial<SystemStatusState>): void => {
    Object.assign(systemStatusState, status);
  };

  const resetSystemStatus = (): void => {
    Object.assign(systemStatusState, createDefaultSystemStatus());
    systemStatusReady.value = false;
    systemStatusLastUpdated.value = null;
    systemStatusApiAvailable.value = true;
  };

  const applySystemStatusPayload = (
    payload: SystemStatusPayload | Partial<SystemStatusState>,
  ): void => {
    const {
      metrics: _metrics,
      message: _message,
      updated_at: _updatedAt,
      type: _type,
      ...status
    } = payload as Record<string, unknown>;
    updateSystemStatus(status as Partial<SystemStatusState>);
    const timestamp =
      (payload as SystemStatusPayload).updated_at || (payload as SystemStatusPayload).last_updated || null;
    const resolvedTimestamp = timestamp ? new Date(timestamp) : new Date();
    systemStatusReady.value = true;
    systemStatusApiAvailable.value = true;
    systemStatusLastUpdated.value = resolvedTimestamp;
  };

  const markSystemStatusHydrated = (date: Date | null = null): void => {
    systemStatusReady.value = true;
    systemStatusApiAvailable.value = true;
    systemStatusLastUpdated.value = date ?? new Date();
  };

  const markSystemStatusUnavailable = (date: Date | null = null): void => {
    systemStatusReady.value = true;
    systemStatusApiAvailable.value = false;
    systemStatusLastUpdated.value = date ?? new Date();
  };

  const setQueueManagerActive = (active: boolean): void => {
    queueManagerActive.value = active;
  };

  const resetConnection = (): void => {
    resetSystemStatus();
    setConnectionState(false);
    setPollInterval(DEFAULT_POLL_INTERVAL);
    setQueueManagerActive(false);
  };

  return {
    systemStatus,
    isConnected: isConnectedState,
    pollIntervalMs: pollIntervalState,
    systemStatusReady: systemStatusReadyState,
    systemStatusLastUpdated: systemStatusLastUpdatedState,
    systemStatusApiAvailable: systemStatusApiAvailableState,
    queueManagerActive: queueManagerActiveState,
    setConnectionState,
    setPollInterval,
    updateSystemStatus,
    resetSystemStatus,
    applySystemStatusPayload,
    markSystemStatusHydrated,
    markSystemStatusUnavailable,
    setQueueManagerActive,
    resetConnection,
  };
};

export type SystemStatusModule = ReturnType<typeof createSystemStatusModule>;
