import { createGenerationParams, requestGeneration } from '@/services/generationService';

import type { CompositionEntry } from '@/types';

export interface PromptGenerationPayload {
  prompt: string;
  negativePrompt: string;
  loras: CompositionEntry[];
}

const cloneEntries = (entries: CompositionEntry[]): CompositionEntry[] => entries.map((entry) => ({ ...entry }));

export const triggerPromptGeneration = async ({
  prompt,
  negativePrompt,
  loras,
}: PromptGenerationPayload): Promise<boolean> => {
  try {
    const trimmedNegative = negativePrompt.trim();
    const params = createGenerationParams({
      prompt,
      negative_prompt: trimmedNegative ? trimmedNegative : null,
    });

    await requestGeneration({
      ...params,
      loras: cloneEntries(loras),
    });

    return true;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('Failed to trigger generation', err);
    }
    return false;
  }
};
