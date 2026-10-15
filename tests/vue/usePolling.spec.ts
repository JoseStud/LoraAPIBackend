import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { usePolling } from '@/composables/shared/usePolling';

import { createPageEnvironment } from '../mocks/pageEnvironment';

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

  describe('page environment', () => {
    const environment = createPageEnvironment();

    beforeEach(() => {
      environment.install();
    });

    afterEach(() => {
      environment.restore();
      vi.restoreAllMocks();
    });

    it('pauses while hidden and runs once on resume', () => {
      const callback = vi.fn();
      const polling = usePolling(callback, { interval: 1_000, minInterval: 100 });
      polling.subscribe();

      environment.setHidden(true);
      expect(polling.isActive.value).toBe(false);
      expect(polling.isPaused.value).toBe(true);

      vi.advanceTimersByTime(5_000);
      expect(callback).not.toHaveBeenCalled();

      environment.setHidden(false);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(polling.isActive.value).toBe(true);
      expect(polling.isPaused.value).toBe(false);

      vi.advanceTimersByTime(1_000);
      expect(callback).toHaveBeenCalledTimes(2);

      polling.unsubscribe();
    });

    it('pauses while offline and stays paused until both online and visible', () => {
      const callback = vi.fn();
      const polling = usePolling(callback, { interval: 1_000, minInterval: 100 });
      polling.start();

      environment.setOnline(false);
      environment.setHidden(true);
      environment.setOnline(true);
      vi.advanceTimersByTime(3_000);
      expect(callback).not.toHaveBeenCalled();
      expect(polling.isActive.value).toBe(false);

      environment.setHidden(false);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(polling.isActive.value).toBe(true);

      polling.stop();
    });

    it('does not start the timer when started while hidden', () => {
      environment.setHidden(true);
      const callback = vi.fn();
      const polling = usePolling(callback, { interval: 1_000, minInterval: 100 });

      polling.subscribe();
      expect(polling.isActive.value).toBe(false);
      vi.advanceTimersByTime(3_000);
      expect(callback).not.toHaveBeenCalled();

      environment.setHidden(false);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(polling.isActive.value).toBe(true);

      polling.unsubscribe();
    });

    it('attaches one set of listeners for every subscriber and removes it after the last', () => {
      const addDocument = vi.spyOn(document, 'addEventListener');
      const removeDocument = vi.spyOn(document, 'removeEventListener');
      const addWindow = vi.spyOn(window, 'addEventListener');
      const removeWindow = vi.spyOn(window, 'removeEventListener');
      const callback = vi.fn();
      const polling = usePolling(callback, { interval: 1_000, minInterval: 100 });

      polling.subscribe();
      polling.subscribe();
      polling.start();

      expect(addDocument).toHaveBeenCalledTimes(1);
      expect(addDocument).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
      expect(addWindow.mock.calls.map(([type]) => type)).toEqual(['online', 'offline']);

      polling.unsubscribe();
      expect(removeDocument).not.toHaveBeenCalled();

      polling.unsubscribe();
      expect(removeDocument).toHaveBeenCalledTimes(1);
      expect(removeWindow.mock.calls.map(([type]) => type)).toEqual(['online', 'offline']);

      environment.setHidden(true);
      environment.setHidden(false);
      expect(callback).not.toHaveBeenCalled();
      expect(polling.isActive.value).toBe(false);
    });

    it('keeps the hidden interval change for the resumed timer', () => {
      const callback = vi.fn();
      const polling = usePolling(callback, { interval: 1_000, minInterval: 100 });
      polling.subscribe();

      environment.setHidden(true);
      polling.setInterval(2_000);
      expect(polling.isActive.value).toBe(false);

      environment.setHidden(false);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1_000);
      expect(callback).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1_000);
      expect(callback).toHaveBeenCalledTimes(2);

      polling.unsubscribe();
    });

    it('keeps running while hidden when pauseWhenHidden is false', () => {
      const callback = vi.fn();
      const polling = usePolling(callback, {
        interval: 1_000,
        minInterval: 100,
        pauseWhenHidden: false,
      });
      polling.start();

      environment.setHidden(true);
      vi.advanceTimersByTime(1_000);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(polling.isPaused.value).toBe(false);

      polling.stop();
    });
  });
});
