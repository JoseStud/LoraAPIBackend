import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { usePolling } from '@/composables/usePolling';

describe('usePolling composable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts polling when the first subscriber registers and stops after the last unsubscribe', () => {
    const callback = vi.fn();
    const polling = usePolling(callback, { interval: 250, minInterval: 100 });

    expect(polling.isActive.value).toBe(false);

    const started = polling.subscribe();
    expect(started).toBe(true);
    expect(polling.isActive.value).toBe(true);

    vi.advanceTimersByTime(250);
    expect(callback).toHaveBeenCalledTimes(1);

    const stopped = polling.unsubscribe();
    expect(stopped).toBe(true);
    expect(polling.isActive.value).toBe(false);

    vi.advanceTimersByTime(500);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('normalises interval updates and restarts the timer when changed', () => {
    const callback = vi.fn();
    const polling = usePolling(callback, { interval: 500, minInterval: 200 });

    polling.subscribe();
    expect(polling.intervalMs.value).toBe(500);

    polling.setInterval(150);
    expect(polling.intervalMs.value).toBe(200);

    vi.advanceTimersByTime(200);
    expect(callback).toHaveBeenCalledTimes(1);

    polling.setInterval(600);
    expect(polling.intervalMs.value).toBe(600);

    vi.advanceTimersByTime(600);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('tracks multiple subscribers and only stops after the last unsubscribe', () => {
    const callback = vi.fn();
    const polling = usePolling(callback, { interval: 400, minInterval: 100 });

    const first = polling.subscribe();
    const second = polling.subscribe();

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(polling.subscriberCount.value).toBe(2);
    expect(polling.isActive.value).toBe(true);

    vi.advanceTimersByTime(400);
    expect(callback).toHaveBeenCalledTimes(1);

    const secondStopped = polling.unsubscribe();
    expect(secondStopped).toBe(false);
    expect(polling.isActive.value).toBe(true);
    expect(polling.subscriberCount.value).toBe(1);

    const firstStopped = polling.unsubscribe();
    expect(firstStopped).toBe(true);
    expect(polling.isActive.value).toBe(false);
    expect(polling.subscriberCount.value).toBe(0);
  });
});
