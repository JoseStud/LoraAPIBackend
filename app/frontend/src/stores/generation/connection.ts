import { reactive, ref } from 'vue';
import { defineStore } from 'pinia';

import { DEFAULT_POLL_INTERVAL } from '@/services/generationUpdates';
import type { SystemStatusPayload, SystemStatusState } from '@/types';

export const DEFAULT_SYSTEM_STATUS: SystemStatusState = {
  gpu_available: true,
  queue_length: 0,
  status: 'healthy',
  gpu_status: 'Available',
  memory_used: 0,
  memory_total: 8192,
};

export const useGenerationConnectionStore = defineStore('generation-connection', () => {
  const systemStatus = reactive<SystemStatusState>({ ...DEFAULT_SYSTEM_STATUS });
  const isConnected = ref(false);
  const pollIntervalMs = ref(DEFAULT_POLL_INTERVAL);

  function setConnectionState(connected: boolean): void {
    isConnected.value = connected;
  }

  function setPollInterval(interval: number): void {
    const numeric = Math.floor(Number(interval));
    pollIntervalMs.value = Number.isFinite(numeric) && numeric > 0 ? numeric : DEFAULT_POLL_INTERVAL;
  }

  function updateSystemStatus(status: Partial<SystemStatusState>): void {
    Object.assign(systemStatus, status);
  }

  function resetSystemStatus(): void {
    Object.assign(systemStatus, { ...DEFAULT_SYSTEM_STATUS });
  }

  function applySystemStatusPayload(payload: SystemStatusPayload | Partial<SystemStatusState>): void {
    const {
      metrics: _metrics,
      message: _message,
      updated_at: _updatedAt,
      type: _type,
      ...status
    } = payload as Record<string, unknown>;
    updateSystemStatus(status as Partial<SystemStatusState>);
  }

  function reset(): void {
    resetSystemStatus();
    isConnected.value = false;
    pollIntervalMs.value = DEFAULT_POLL_INTERVAL;
  }

  return {
    systemStatus,
    isConnected,
    pollIntervalMs,
    setConnectionState,
    setPollInterval,
    updateSystemStatus,
    resetSystemStatus,
    applySystemStatusPayload,
    reset,
  };
});

export type GenerationConnectionStore = ReturnType<typeof useGenerationConnectionStore>;
