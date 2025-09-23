import { copyPromptToClipboard } from '@/utils/promptClipboard';
import { triggerPromptGeneration, type PromptGenerationPayload } from '@/utils/promptGeneration';

export interface PromptClipboardService {
  copy: (value: string) => Promise<boolean>;
}

export interface PromptGenerationService {
  trigger: (payload: PromptGenerationPayload) => Promise<boolean>;
}

export const createPromptClipboardService = (): PromptClipboardService => ({
  copy: (value: string) => copyPromptToClipboard(value),
});

export const createPromptGenerationService = (): PromptGenerationService => ({
  trigger: (payload: PromptGenerationPayload) => triggerPromptGeneration(payload),
});
