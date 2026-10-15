import { shallowRef } from 'vue';

import { createGenerationWebSocketManager, type GenerationWebSocketManager } from '../services/websocketManager';
import type { GenerationComplete, GenerationErrorMessage, ProgressUpdate } from '@/types';
import type {
  GenerationTransportError,
  GenerationWebSocketStateSnapshot,
} from '../types/transport';

interface SocketBridgeOptions {
  getBackendUrl: () => string | null | undefined;
  websocketManager?: GenerationWebSocketManager;
  logger?: (...args: unknown[]) => void;
}

interface SocketBridgeCallbacks {
  onProgress?: (message: ProgressUpdate) => void;
  onComplete?: (message: GenerationComplete) => void;
  onError?: (message: GenerationErrorMessage) => void;
  onConnectionChange?: (connected: boolean, snapshot?: GenerationWebSocketStateSnapshot) => void;
  onConnectionStateChange?: (snapshot: GenerationWebSocketStateSnapshot) => void;
  onTransportError?: (error: GenerationTransportError) => void;
}

export const useGenerationSocketBridge = (
  options: SocketBridgeOptions,
  callbacks: SocketBridgeCallbacks,
) => {
  const websocketManagerRef = shallowRef<GenerationWebSocketManager | null>(
    options.websocketManager ?? null,
  );

  const ensureWebSocketManager = (): GenerationWebSocketManager => {
    if (websocketManagerRef.value) {
      return websocketManagerRef.value;
    }

    websocketManagerRef.value = createGenerationWebSocketManager({
      getBackendUrl: options.getBackendUrl,
      logger: options.logger,
      onProgress: (message) => {
        callbacks.onProgress?.(message);
      },
      onComplete: (message) => {
        callbacks.onComplete?.(message);
      },
      onError: (message) => {
        callbacks.onError?.(message);
      },
      onConnectionChange: (connected) => {
        callbacks.onConnectionChange?.(connected);
      },
      onStateChange: (snapshot) => {
        callbacks.onConnectionStateChange?.(snapshot);
      },
      onTransportError: (error) => {
        callbacks.onTransportError?.(error);
      },
    });

    return websocketManagerRef.value;
  };

  const start = (): void => {
    ensureWebSocketManager().start();
  };

  const stop = (): void => {
    websocketManagerRef.value?.stop();
  };

  const reconnect = (): void => {
    ensureWebSocketManager().reconnect();
  };

  const clear = (): void => {
    stop();
    websocketManagerRef.value = null;
  };

  return {
    start,
    stop,
    reconnect,
    clear,
  };
};

export type UseGenerationSocketBridgeReturn = ReturnType<typeof useGenerationSocketBridge>;
