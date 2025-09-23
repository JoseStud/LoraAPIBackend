import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

import {
  createPromptCompositionPersistence,
  parseSavedComposition,
  type PromptCompositionPersistence,
} from '@/utils/promptCompositionPersistence';

import type { CompositionEntry, SavedComposition } from '@/types';

export interface PromptCompositionPersistenceBindings {
  lastSaved: Ref<SavedComposition | null>;
  saveComposition: () => void;
  loadComposition: () => void;
}

interface UsePromptCompositionPersistenceOptions {
  activeLoras: Ref<CompositionEntry[]>;
  basePrompt: Ref<string>;
  negativePrompt: Ref<string>;
  basePromptError: Ref<string>;
  persistence?: PromptCompositionPersistence;
}

const cloneEntries = (entries: CompositionEntry[]): CompositionEntry[] => entries.map((entry) => ({ ...entry }));

const buildPayload = (
  activeLoras: Ref<CompositionEntry[]>,
  basePrompt: Ref<string>,
  negativePrompt: Ref<string>,
): SavedComposition => ({
  items: cloneEntries(activeLoras.value),
  base: basePrompt.value,
  neg: negativePrompt.value,
});

export const usePromptCompositionPersistence = ({
  activeLoras,
  basePrompt,
  negativePrompt,
  basePromptError,
  persistence = createPromptCompositionPersistence(),
}: UsePromptCompositionPersistenceOptions): PromptCompositionPersistenceBindings => {
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

    activeLoras.value = cloneEntries(parsed.items);
    basePrompt.value = parsed.base;
    negativePrompt.value = parsed.neg;
    basePromptError.value = '';
    lastSaved.value = parsed;
  };

  watch(
    [activeLoras, basePrompt, negativePrompt],
    ([items, base, neg]: [CompositionEntry[], string, string]) => {
      const payload: SavedComposition = {
        items: cloneEntries(items),
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
