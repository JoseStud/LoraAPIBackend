import mitt from 'mitt';

export interface BackendUrlChangedEvent {
  next: string;
  previous: string | null;
}

type BackendEnvironmentEvents = {
  backendUrlChanged: BackendUrlChangedEvent;
};

const emitter = mitt<BackendEnvironmentEvents>();

export type BackendEnvironmentBusHandler = (event: BackendUrlChangedEvent) => void;

export const subscribe = (handler: BackendEnvironmentBusHandler): void => {
  emitter.on('backendUrlChanged', handler);
};

export const unsubscribe = (handler: BackendEnvironmentBusHandler): void => {
  emitter.off('backendUrlChanged', handler);
};

export const emitBackendUrlChanged = (next: string, previous: string | null): void => {
  emitter.emit('backendUrlChanged', { next, previous });
};

export const resetBackendEnvironmentBus = (): void => {
  emitter.all.clear();
};
