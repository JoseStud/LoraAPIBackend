import { onScopeDispose } from 'vue';

// eslint-disable-next-line no-restricted-imports
import type { BackendUrlChangeHandler } from '@/stores/settings';
import {
  subscribe as subscribeToBackendEnvironmentBus,
  unsubscribe as unsubscribeFromBackendEnvironmentBus,
  type BackendEnvironmentBusHandler,
} from './backendEnvironmentEventBus';

export interface BackendEnvironmentSubscription {
  start(): void;
  stop(): void;
  restart(): void;
  isActive(): boolean;
}

export const createBackendEnvironmentSubscription = (
  handler: BackendUrlChangeHandler,
): BackendEnvironmentSubscription => {
  let isSubscribed = false;

  const busHandler: BackendEnvironmentBusHandler = ({ next, previous }) => {
    void handler(next, previous);
  };

  const start = () => {
    if (isSubscribed) {
      return;
    }
    subscribeToBackendEnvironmentBus(busHandler);
    isSubscribed = true;
  };

  const stopSubscription = () => {
    if (!isSubscribed) {
      return;
    }
    unsubscribeFromBackendEnvironmentBus(busHandler);
    isSubscribed = false;
  };

  const restart = () => {
    stopSubscription();
    start();
  };

  const isActive = () => isSubscribed;

  return {
    start,
    stop: stopSubscription,
    restart,
    isActive,
  };
};

export const useBackendEnvironmentSubscription = (
  handler: BackendUrlChangeHandler,
): BackendEnvironmentSubscription => {
  const subscription = createBackendEnvironmentSubscription(handler);
  subscription.start();
  onScopeDispose(subscription.stop);
  return subscription;
};
