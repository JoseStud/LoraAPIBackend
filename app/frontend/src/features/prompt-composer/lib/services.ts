import { copyPromptToClipboard } from '@/utils/promptClipboard';

export interface PromptClipboardService {
  copy: (value: string) => Promise<boolean>;
}

export const createPromptClipboardService = (): PromptClipboardService => ({
  copy: (value: string) => copyPromptToClipboard(value),
});
