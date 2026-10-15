import { computed, ref, type ComputedRef, type Ref } from 'vue';

interface UsePollingOptions {
  interval?: number;
  minInterval?: number;
  /**
   * Pause the timer while the page is hidden or the browser is offline, and run once on resume.
   * Defaults to `true`.
   */
  pauseWhenHidden?: boolean;
}

type PollingCallback = () => void | Promise<void>;

export interface PollingController {
  intervalMs: Ref<number>;
  /** Whether the timer is running. False while paused by the page environment. */
  isActive: ComputedRef<boolean>;
  /** Whether polling was started but is held back because the page is hidden or offline. */
  isPaused: ComputedRef<boolean>;
  subscriberCount: Ref<number>;
  start: () => void;
  stop: () => void;
  setInterval: (value: number) => void;
  subscribe: (interval?: number) => boolean;
  unsubscribe: () => boolean;
}

const isPageEnvironmentPaused = (): boolean => {
  const hidden = typeof document !== 'undefined' && document.hidden === true;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return hidden || offline;
};

/** Calls `apply` on `visibilitychange`/`online`/`offline` until the returned function runs. */
const listenToPageEnvironment = (apply: () => void): (() => void) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  document.addEventListener('visibilitychange', apply);
  window.addEventListener('online', apply);
  window.addEventListener('offline', apply);

  return () => {
    document.removeEventListener('visibilitychange', apply);
    window.removeEventListener('online', apply);
    window.removeEventListener('offline', apply);
  };
};

/**
 * A shared interval. The page-environment listeners exist only between `start()` and `stop()`, so
 * whoever starts the controller owns its teardown: call `stop()` (or release every subscription)
 * from the owning scope's cleanup.
 */
export const usePolling = (
  callback: PollingCallback,
  options: UsePollingOptions = {},
): PollingController => {
  const minInterval = Math.max(1, Math.floor(options.minInterval ?? 1_000));
  const initialInterval = Math.max(minInterval, Math.floor(options.interval ?? 5_000));
  const pauseWhenHidden = options.pauseWhenHidden ?? true;

  const intervalMs = ref(initialInterval);
  const timer = ref<ReturnType<typeof setInterval> | null>(null);
  const subscribers = ref(0);
  // `wanted` is what callers asked for; the timer only runs while the environment allows it.
  const wanted = ref(false);
  const environmentPaused = ref(false);
  let detachEnvironment: (() => void) | null = null;

  const runCallback = () => {
    try {
      const result = callback();
      if (result instanceof Promise) {
        result.catch((error) => {
          if (import.meta.env?.DEV) {
            console.error('[usePolling] Polling callback rejected', error);
          }
        });
      }
    } catch (error) {
      if (import.meta.env?.DEV) {
        console.error('[usePolling] Polling callback threw an error', error);
      }
    }
  };

  const startTimer = () => {
    if (timer.value || environmentPaused.value) {
      return;
    }

    timer.value = setInterval(() => {
      runCallback();
    }, intervalMs.value);
  };

  const clearTimer = () => {
    if (!timer.value) {
      return;
    }

    clearInterval(timer.value);
    timer.value = null;
  };

  const applyEnvironment = () => {
    const paused = isPageEnvironmentPaused();
    if (paused === environmentPaused.value) {
      return;
    }

    environmentPaused.value = paused;

    if (paused) {
      clearTimer();
      return;
    }

    if (wanted.value) {
      startTimer();
      runCallback();
    }
  };

  const start = () => {
    if (wanted.value) {
      return;
    }

    wanted.value = true;

    if (pauseWhenHidden) {
      detachEnvironment = listenToPageEnvironment(applyEnvironment);
      environmentPaused.value = isPageEnvironmentPaused();
    }

    startTimer();
  };

  const stop = () => {
    wanted.value = false;
    detachEnvironment?.();
    detachEnvironment = null;
    environmentPaused.value = false;
    clearTimer();
  };

  const setIntervalMs = (value: number) => {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }

    const normalised = Math.max(minInterval, Math.floor(value));
    if (normalised === intervalMs.value) {
      return;
    }

    intervalMs.value = normalised;

    if (timer.value) {
      clearTimer();
      startTimer();
    }
  };

  const subscribe = (value?: number): boolean => {
    if (typeof value === 'number') {
      setIntervalMs(value);
    }

    subscribers.value += 1;
    const shouldStart = subscribers.value === 1;
    if (shouldStart) {
      start();
    }

    return shouldStart;
  };

  const unsubscribe = (): boolean => {
    if (subscribers.value === 0) {
      return false;
    }

    subscribers.value = Math.max(0, subscribers.value - 1);
    const shouldStop = subscribers.value === 0;
    if (shouldStop) {
      stop();
    }

    return shouldStop;
  };

  const isActive = computed(() => timer.value !== null);
  const isPaused = computed(() => wanted.value && environmentPaused.value);

  return {
    intervalMs,
    isActive,
    isPaused,
    subscriberCount: subscribers,
    start,
    stop,
    setInterval: setIntervalMs,
    subscribe,
    unsubscribe,
  };
};
