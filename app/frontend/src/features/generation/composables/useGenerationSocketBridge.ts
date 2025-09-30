import { shallowRef } from 'vue';

import {
  createGenerationWebSocketManager,
  ensureArray,
  type GenerationWebSocketManager,
} from '@/services';
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationProgressMessage,
  SystemStatusPayload,
  SystemStatusState,
} from '@/types';
import type { GenerationJobInput } from '@/features/generation/stores';

interface SocketBridgeOptions {
  getBackendUrl: () => string | null | undefined;
  websocketManager?: GenerationWebSocketManager;
  logger?: (...args: unknown[]) => void;
}

interface SocketBridgeCallbacks {
  onProgress?: (message: GenerationProgressMessage) => void;
  onComplete?: (message: GenerationCompleteMessage) => void;
  onError?: (message: GenerationErrorMessage) => void;
  onQueueUpdate?: (jobs: GenerationJobInput[]) => void;
  onSystemStatus?: (payload: SystemStatusPayload | Partial<SystemStatusState>) => void;
  onConnectionChange?: (connected: boolean) => void;
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
      onQueueUpdate: (jobs) => {
        callbacks.onQueueUpdate?.(ensureArray<GenerationJobInput>(jobs));
      },
      onSystemStatus: (payload) => {
        callbacks.onSystemStatus?.(payload);
      },
      onConnectionChange: (connected) => {
        callbacks.onConnectionChange?.(connected);
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
