import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

import {
  createPromptCompositionPersistence,
  parseSavedComposition,
  type PromptCompositionPersistence,
} from '@/utils/promptCompositionPersistence';

import type { CompositionEntry, SavedComposition } from '@/types';
import { cloneCompositionEntries } from '../lib/composition';

export interface PromptComposerPersistenceBindings {
  lastSaved: Ref<SavedComposition | null>;
  saveComposition: () => void;
  loadComposition: () => void;
}

interface UsePromptComposerPersistenceOptions {
  activeLoras: Ref<CompositionEntry[]>;
  basePrompt: Ref<string>;
  negativePrompt: Ref<string>;
  basePromptError: Ref<string>;
  persistence?: PromptCompositionPersistence;
}

const buildPayload = (
  activeLoras: Ref<CompositionEntry[]>,
  basePrompt: Ref<string>,
  negativePrompt: Ref<string>,
): SavedComposition => ({
  items: cloneCompositionEntries(activeLoras.value),
  base: basePrompt.value,
  neg: negativePrompt.value,
});

export const usePromptComposerPersistence = ({
  activeLoras,
  basePrompt,
  negativePrompt,
  basePromptError,
  persistence = createPromptCompositionPersistence(),
}: UsePromptComposerPersistenceOptions): PromptComposerPersistenceBindings => {
  const lastSaved = ref<SavedComposition | null>(null);

  const persistPayload = (payload: SavedComposition) => {
    lastSaved.value = payload;
    persistence.save(payload);
  };

  const saveComposition = (): void => {
    persistPayload(buildPayload(activeLoras, basePrompt, negativePrompt));
  };

  const loadComposition = (): void => {
    const payload = persistence.load() ?? lastSaved.value;

    if (!payload) {
      return;
    }

    const parsed = parseSavedComposition(payload);

    if (!parsed) {
      return;
    }

    activeLoras.value = cloneCompositionEntries(parsed.items);
    basePrompt.value = parsed.base;
    negativePrompt.value = parsed.neg;
    basePromptError.value = '';
    lastSaved.value = parsed;
  };

  watch(
    [activeLoras, basePrompt, negativePrompt],
    ([items, base, neg]: [CompositionEntry[], string, string]) => {
      const payload: SavedComposition = {
        items: cloneCompositionEntries(items),
        base,
        neg,
      };

      lastSaved.value = payload;
      persistence.scheduleSave(payload);
    },
    { deep: true },
  );

  onBeforeUnmount(() => {
    persistence.cancel();
  });

  return {
    lastSaved,
    saveComposition,
    loadComposition,
  };
};
