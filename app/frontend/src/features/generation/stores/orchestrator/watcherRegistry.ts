import type { WatchStopHandle } from 'vue';

export const createWatcherRegistry = () => {
  let watchers: WatchStopHandle[] = [];

  const register = (stopHandle: WatchStopHandle): void => {
    watchers.push(stopHandle);
  };

  const stopAll = (): void => {
    watchers.forEach((stop) => {
      stop();
    });
    watchers = [];
  };

  return {
    register,
    stopAll,
  };
};

export type WatcherRegistry = ReturnType<typeof createWatcherRegistry>;
