import { computed, onBeforeUnmount, ref, shallowRef, type ComputedRef, type Ref } from 'vue';

import { useNotifications } from '@/composables/shared';
import {
  useGenerationOrchestratorManager,
  type GenerationOrchestratorBinding,
} from '@/features/generation/composables/useGenerationOrchestratorManager';
import { createGenerationParams } from '@/features/generation/services';
import type { CompositionEntry, GenerationRequestPayload } from '@/types';

import { cloneCompositionEntries } from '../lib/composition';
import { createPromptClipboardService, type PromptClipboardService } from '../lib/services';
import { createPromptComposerTracer } from '../lib/tracing';

interface UsePromptComposerGenerationOptions {
  finalPrompt: ComputedRef<string>;
  negativePrompt: Ref<string>;
  activeLoras: Ref<CompositionEntry[]>;
  validate: () => boolean;
  clipboard?: PromptClipboardService;
}

export interface PromptComposerGenerationBindings {
  isGenerating: Ref<boolean>;
  canGenerate: ComputedRef<boolean>;
  copyPrompt: () => Promise<boolean>;
  generateImage: () => Promise<boolean>;
}

type PromptComposerGenerationPayload = GenerationRequestPayload & {
  loras: CompositionEntry[];
};

export const usePromptComposerGeneration = ({
  finalPrompt,
  negativePrompt,
  activeLoras,
  validate,
  clipboard = createPromptClipboardService(),
}: UsePromptComposerGenerationOptions): PromptComposerGenerationBindings => {
  const isGenerating = ref(false);
  const canGenerate = computed(() => !isGenerating.value);

  const notifications = useNotifications();
  const orchestratorManager = useGenerationOrchestratorManager();
  const tracer = createPromptComposerTracer();

  const orchestratorBinding = shallowRef<GenerationOrchestratorBinding | null>(null);

  const ensureBinding = async (): Promise<GenerationOrchestratorBinding> => {
    if (!orchestratorBinding.value) {
      orchestratorBinding.value = orchestratorManager.acquire({
        notify: (message, type) => {
          notifications.notify(message, type);
        },
        debug: (...args: unknown[]) => {
          if (import.meta.env.DEV) {
            console.debug('[prompt-composer]', ...args);
          }
        },
      });
    }

    const binding = orchestratorBinding.value;
    await binding.initialize();
    return binding;
  };

  onBeforeUnmount(() => {
    orchestratorBinding.value?.release();
    orchestratorBinding.value = null;
  });

  const copyPrompt = async (): Promise<boolean> => {
    return clipboard.copy(finalPrompt.value || '');
  };

  const generateImage = async (): Promise<boolean> => {
    tracer.emit('validate', {
      promptLength: finalPrompt.value.length,
      loraCount: activeLoras.value.length,
    });

    const isValid = validate();

    if (!isValid) {
      tracer.emit('abort', { reason: 'validation_failed' });
      return false;
    }

    isGenerating.value = true;

    try {
      const binding = await ensureBinding();
      const trimmedNegative = negativePrompt.value.trim();
      const params = createGenerationParams({
        prompt: finalPrompt.value,
        negative_prompt: trimmedNegative ? trimmedNegative : null,
      });

      const payload: PromptComposerGenerationPayload = {
        ...params,
        loras: cloneCompositionEntries(activeLoras.value),
      };

      tracer.emit('submit', {
        promptLength: payload.prompt.length,
        loraCount: payload.loras.length,
      });

      await binding.startGeneration(payload as GenerationRequestPayload);

      notifications.showSuccess('Generation requested');
      return true;
    } catch (error) {
      tracer.emit('abort', {
        reason: 'request_failed',
        message: error instanceof Error ? error.message : String(error),
      });
      notifications.showError('Failed to start generation');
      return false;
    } finally {
      isGenerating.value = false;
    }
  };

  return {
    isGenerating,
    canGenerate,
    copyPrompt,
    generateImage,
  };
};
