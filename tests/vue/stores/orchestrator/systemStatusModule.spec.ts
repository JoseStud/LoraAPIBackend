import { describe, it, expect, vi } from 'vitest';

import { createSystemStatusModule, DEFAULT_SYSTEM_STATUS } from '@/features/generation/stores/orchestrator/systemStatusModule';

describe('systemStatusModule', () => {
  it('updates poll interval and invokes callback', () => {
    const onPollIntervalChange = vi.fn();
    const systemStatus = createSystemStatusModule({ onPollIntervalChange });

    systemStatus.setPollInterval(2500);
    expect(systemStatus.pollIntervalMs.value).toBe(2500);
    expect(onPollIntervalChange).toHaveBeenCalledWith(2500);

  });

  it('applies payloads and resets connection state', () => {
    const systemStatus = createSystemStatusModule();
    const payload = {
      queue_length: 3,
      gpu_available: true,
      updated_at: new Date().toISOString(),
    } as any;

    systemStatus.applySystemStatusPayload(payload);
    expect(systemStatus.systemStatus.queue_length).toBe(3);
    expect(systemStatus.systemStatusReady.value).toBe(true);
    expect(systemStatus.systemStatusApiAvailable.value).toBe(true);

    systemStatus.setConnectionState(true);
    systemStatus.resetConnection();
    expect(systemStatus.systemStatus).toEqual(DEFAULT_SYSTEM_STATUS);
    expect(systemStatus.isConnected.value).toBe(false);
  });
});
