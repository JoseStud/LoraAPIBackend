import { onBeforeUnmount, onMounted } from 'vue';

import {
  useGenerationOrchestratorManager,
  type GenerationOrchestratorBinding,
} from './useGenerationOrchestratorManager';
import type { GenerationNotificationAdapter } from '../types/transport';

const createConsoleNotifier = (label: string): GenerationNotificationAdapter => ({
  notify: (message, type = 'info') => {
    const entry = { message, type, timestamp: new Date().toISOString() };
    if (type === 'error') {
      console.error(`[${label}]`, entry);
    } else if (type === 'warning') {
      console.warn(`[${label}]`, entry);
    } else {
      console.info(`[${label}]`, entry);
    }
  },
  debug: (...args: unknown[]) => {
    console.debug(`[${label}]`, ...args);
  },
});

/**
 * Keeps the shared orchestrator running while a widget that only reads its state is mounted:
 * acquires a binding on mount, initializes it, and releases it on unmount. Widgets log
 * notifications instead of showing toasts (full consumers such as the Studio show those) and leave
 * history and backend-URL syncing to full consumers.
 */
export const useGenerationWidgetBinding = (label: string): void => {
  const manager = useGenerationOrchestratorManager();
  let binding: GenerationOrchestratorBinding | null = null;

  onMounted(() => {
    binding = manager.acquire({ ...createConsoleNotifier(label), autoSync: false });
    void binding.initialize().catch((error) => {
      console.error(`[${label}] Failed to initialize the generation orchestrator`, error);
    });
  });

  onBeforeUnmount(() => {
    binding?.release();
    binding = null;
  });
};
