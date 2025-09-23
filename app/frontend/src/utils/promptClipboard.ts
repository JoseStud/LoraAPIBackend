import { copyToClipboard } from '@/utils/browser';

export const copyPromptToClipboard = async (prompt: string): Promise<boolean> => {
  try {
    const success = await copyToClipboard(prompt);

    if (!success && import.meta.env.DEV) {
      console.warn('Failed to copy prompt to clipboard');
    }

    return success;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('Copy prompt failed', err);
    }
    return false;
  }
};
