import { onScopeDispose } from 'vue';

// Access settings store directly to avoid circular dependencies when importing from the stores barrel.
// eslint-disable-next-line no-restricted-imports
import { useBackendEnvironment, type BackendUrlChangeHandler } from '@/stores/settings';

export interface BackendEnvironmentSubscription {
  start(): void;
  stop(): void;
  restart(): void;
  isActive(): boolean;
}

export const createBackendEnvironmentSubscription = (
  handler: BackendUrlChangeHandler,
): BackendEnvironmentSubscription => {
  const backendEnvironment = useBackendEnvironment();
  let stop: (() => void) | null = null;

  const start = () => {
    if (stop) {
      return;
    }
    stop = backendEnvironment.onBackendUrlChange((next, previous) => {
      void handler(next, previous);
    });
  };

  const stopSubscription = () => {
    if (!stop) {
      return;
    }
    stop();
    stop = null;
  };

  const restart = () => {
    stopSubscription();
    start();
  };

  const isActive = () => stop != null;

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
