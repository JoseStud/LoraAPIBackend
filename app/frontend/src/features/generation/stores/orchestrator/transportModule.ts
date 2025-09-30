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

  const clearTransport = (): void => {
    transport.value?.clear();
    transport.value = null;
  };

  return {
    transport,
    ensureTransport,
    setTransport,
    clearTransport,
  };
};

export type TransportModule = ReturnType<typeof createTransportModule>;
