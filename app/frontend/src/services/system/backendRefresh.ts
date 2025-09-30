import { onScopeDispose } from 'vue';

import {
  type BackendEnvironmentSubscription,
  useBackendEnvironmentSubscription,
} from './backendEnvironmentBus';

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

export interface BackendRefreshSubscription extends BackendEnvironmentSubscription {
  /**
   * Manually request a refresh using the configured throttling rules.
   */
  trigger(): void;
}

export const useBackendRefresh = (
  refresh: () => void | Promise<void>,
  options: BackendRefreshOptions = {},
): BackendRefreshSubscription => {
  const { throttleMs = 0, immediate = false } = options;

  let lastRunAt = 0;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let isSubscribed = true;

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

  const scheduleRefresh = () => {
    if (!isSubscribed || !subscription.isActive()) {
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

  const subscription = useBackendEnvironmentSubscription(() => {
    scheduleRefresh();
  });

  const stop = () => {
    if (!isSubscribed) {
      return;
    }
    isSubscribed = false;
    clearPendingTimer();
    subscription.stop();
  };

  const start = () => {
    if (isSubscribed) {
      return;
    }
    isSubscribed = true;
    lastRunAt = 0;
    subscription.start();
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

  const isActive = () => isSubscribed && subscription.isActive();

  onScopeDispose(() => {
    clearPendingTimer();
    isSubscribed = false;
  });

  if (immediate) {
    scheduleRefresh();
  }

  return {
    start,
    stop,
    restart,
    isActive,
    trigger,
  } satisfies BackendRefreshSubscription;
};
