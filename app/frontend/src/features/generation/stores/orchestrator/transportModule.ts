import { ref } from 'vue';

import type { GenerationTransportAdapter } from '../../composables/createGenerationTransportAdapter';

export const createTransportModule = () => {
  const transport = ref<GenerationTransportAdapter | null>(null);

  const ensureTransport = (): GenerationTransportAdapter => {
    const instance = transport.value;
    if (!instance) {
      throw new Error('Generation transport has not been initialized');
    }
    return instance;
  };

  const setTransport = (adapter: GenerationTransportAdapter): void => {
    transport.value = adapter;
  };

  const setPollInterval = (interval: number): void => {
    transport.value?.setPollInterval(interval);
  };

  const reconnect = (): void => {
    transport.value?.reconnect();
  };

  const clearTransport = (): void => {
    transport.value?.clear();
    transport.value = null;
  };

  const withTransport = <T>(callback: (adapter: GenerationTransportAdapter) => T): T => {
    const instance = ensureTransport();
    return callback(instance);
  };

  return {
    ensureTransport,
    setTransport,
    setPollInterval,
    reconnect,
    clearTransport,
    withTransport,
  };
};

export type TransportModule = ReturnType<typeof createTransportModule>;
