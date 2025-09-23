import { computed, ref, type ComputedRef, type Ref } from 'vue';

interface UsePollingOptions {
  interval?: number;
  minInterval?: number;
}

type PollingCallback = () => void | Promise<void>;

export interface PollingController {
  intervalMs: Ref<number>;
  isActive: ComputedRef<boolean>;
  subscriberCount: Ref<number>;
  start: () => void;
  stop: () => void;
  setInterval: (value: number) => void;
  subscribe: (interval?: number) => boolean;
  unsubscribe: () => boolean;
}

export const usePolling = (
  callback: PollingCallback,
  options: UsePollingOptions = {},
): PollingController => {
  const minInterval = Math.max(1, Math.floor(options.minInterval ?? 1_000));
  const initialInterval = Math.max(minInterval, Math.floor(options.interval ?? 5_000));

  const intervalMs = ref(initialInterval);
  const timer = ref<ReturnType<typeof setInterval> | null>(null);
  const subscribers = ref(0);

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

  const start = () => {
    if (timer.value) {
      return;
    }

    timer.value = setInterval(() => {
      runCallback();
    }, intervalMs.value);
  };

  const stop = () => {
    if (!timer.value) {
      return;
    }

    clearInterval(timer.value);
    timer.value = null;
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
      stop();
      start();
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

  return {
    intervalMs,
    isActive,
    subscriberCount: subscribers,
    start,
    stop,
    setInterval: setIntervalMs,
    subscribe,
    unsubscribe,
  };
};
