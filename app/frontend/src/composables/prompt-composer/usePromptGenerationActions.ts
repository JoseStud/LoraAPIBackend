import { computed, ref, type ComputedRef, type Ref } from 'vue';

import type { CompositionEntry } from '@/types';

import {
  createPromptClipboardService,
  createPromptGenerationService,
  type PromptClipboardService,
  type PromptGenerationService,
} from './services';

interface UsePromptGenerationActionsOptions {
  finalPrompt: ComputedRef<string>;
  negativePrompt: Ref<string>;
  activeLoras: Ref<CompositionEntry[]>;
  validate: () => boolean;
  clipboard?: PromptClipboardService;
  generator?: PromptGenerationService;
}

export interface PromptGenerationActionsBindings {
  isGenerating: Ref<boolean>;
  canGenerate: ComputedRef<boolean>;
  copyPrompt: () => Promise<boolean>;
  generateImage: () => Promise<boolean>;
}

export const usePromptGenerationActions = ({
  finalPrompt,
  negativePrompt,
  activeLoras,
  validate,
  clipboard = createPromptClipboardService(),
  generator = createPromptGenerationService(),
}: UsePromptGenerationActionsOptions): PromptGenerationActionsBindings => {
  const isGenerating = ref(false);
  const canGenerate = computed(() => !isGenerating.value);

  const copyPrompt = async (): Promise<boolean> => {
    return clipboard.copy(finalPrompt.value || '');
  };

  const generateImage = async (): Promise<boolean> => {
    if (!validate()) {
      return false;
    }

    isGenerating.value = true;

    try {
      const success = await generator.trigger({
        prompt: finalPrompt.value,
        negativePrompt: negativePrompt.value,
        loras: activeLoras.value,
      });

      return success;
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
