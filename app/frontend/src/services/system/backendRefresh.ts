import { getCurrentScope, onScopeDispose, watch, type WatchStopHandle } from 'vue';

import { useBackendBase } from '@/utils/backend';

export interface BackendRefreshOptions {
  /**
   * Minimum amount of time (in milliseconds) between refresh executions.
   * Defaults to `0`, meaning every backend change triggers an immediate refresh.
   */
  throttleMs?: number;
  /**
   * When `true`, the refresh callback will be scheduled immediately after the helper is created.
   */
  immediate?: boolean;
}

export interface BackendRefreshSubscription {
  /**
   * Manually request a refresh using the configured throttling rules.
   */
  trigger(): void;
  start(): void;
  stop(): void;
  restart(): void;
  isActive(): boolean;
}

export const useBackendRefresh = (
  refresh: () => void | Promise<void>,
  options: BackendRefreshOptions = {},
): BackendRefreshSubscription => {
  const { throttleMs = 0, immediate = false } = options;

  const backendBase = useBackendBase();

  let lastRunAt = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let isSubscribed = false;
  let stopWatcher: WatchStopHandle | null = null;

  const clearPendingTimer = () => {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
  };

  const runRefresh = () => {
    clearPendingTimer();
    lastRunAt = Date.now();
    void refresh();
  };

  const ensureWatcher = () => {
    if (stopWatcher) {
      return;
    }

    stopWatcher = watch(
      backendBase,
      (next, previous) => {
        if (!isSubscribed || next === previous) {
          return;
        }

        scheduleRefresh();
      },
      { flush: 'post' },
    );
  };

  const scheduleRefresh = () => {
    if (!isSubscribed) {
      return;
    }

    if (throttleMs <= 0) {
      runRefresh();
      return;
    }

    const elapsed = Date.now() - lastRunAt;
    if (elapsed >= throttleMs) {
      runRefresh();
      return;
    }

    clearPendingTimer();
    pendingTimer = setTimeout(runRefresh, throttleMs - elapsed);
  };

  const stop = () => {
    if (!isSubscribed) {
      return;
    }
    isSubscribed = false;
    clearPendingTimer();
    if (stopWatcher) {
      stopWatcher();
      stopWatcher = null;
    }
  };

  const start = () => {
    if (isSubscribed) {
      return;
    }
    isSubscribed = true;
    lastRunAt = 0;
    ensureWatcher();
    if (immediate) {
      scheduleRefresh();
    }
  };

  const restart = () => {
    stop();
    start();
  };

  const trigger = () => {
    scheduleRefresh();
  };

  const isActive = () => isSubscribed;

  if (getCurrentScope()) {
    onScopeDispose(() => {
      stop();
    });
  }

  start();

  return {
    start,
    stop,
    restart,
    isActive,
    trigger,
  } satisfies BackendRefreshSubscription;
};
