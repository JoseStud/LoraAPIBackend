import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';

import { PROMPT_COMPOSITION_DEFAULT_WEIGHT } from '@/constants/promptComposer';
import { copyPromptToClipboard } from '@/utils/promptClipboard';
import {
  createPromptCompositionPersistence,
  parseSavedComposition,
} from '@/utils/promptCompositionPersistence';
import { triggerPromptGeneration } from '@/utils/promptGeneration';

import type { AdapterSummary, CompositionEntry, SavedComposition } from '@/types';

import { useAdapterCatalog, type AdapterCatalogApi } from './useAdapterCatalog';

const formatWeightToken = (value: number | string | null | undefined): string => {
  const parsed = typeof value === 'number' ? value : Number(value);
  const numeric = Number.isFinite(parsed) ? parsed : PROMPT_COMPOSITION_DEFAULT_WEIGHT;
  const fixed = numeric.toFixed(2);
  const trimmed = fixed
    .replace(/(\.\d*?[1-9])0+$/u, '$1')
    .replace(/\.0+$/u, '');
  return trimmed.includes('.') ? trimmed : `${trimmed}.0`;
};

const buildFinalPrompt = (base: string, items: CompositionEntry[]): string => {
  const trimmedBase = base.trim();

  if (!trimmedBase) {
    return '';
  }

  const tokens = items.map((entry) => `<lora:${entry.name}:${formatWeightToken(entry.weight)}>`);
  return [trimmedBase, ...tokens].join(' ');
};

const normaliseWeight = (value: number): number => {
  if (!Number.isFinite(value)) {
    return PROMPT_COMPOSITION_DEFAULT_WEIGHT;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 2) {
    return 2;
  }

  return value;
};

export interface PromptCompositionState {
  catalog: AdapterCatalogApi;
  activeLoras: Ref<CompositionEntry[]>;
  basePrompt: Ref<string>;
  negativePrompt: Ref<string>;
  finalPrompt: ComputedRef<string>;
  basePromptError: Ref<string>;
  isGenerating: Ref<boolean>;
  canGenerate: ComputedRef<boolean>;
  canSave: ComputedRef<boolean>;
}

export interface PromptCompositionActions {
  addToComposition: (lora: AdapterSummary) => void;
  removeFromComposition: (index: number) => void;
  moveUp: (index: number) => void;
  moveDown: (index: number) => void;
  updateWeight: (index: number, weight: number) => void;
  balanceWeights: () => void;
  duplicateComposition: () => void;
  clearComposition: () => void;
  setBasePrompt: (value: string) => void;
  setNegativePrompt: (value: string) => void;
  copyPrompt: () => Promise<boolean>;
  saveComposition: () => void;
  loadComposition: () => void;
  generateImage: () => Promise<boolean>;
  isInComposition: (id: AdapterSummary['id']) => boolean;
}

export const usePromptComposition = (): PromptCompositionState & PromptCompositionActions => {
  const catalog = useAdapterCatalog();
  const persistence = createPromptCompositionPersistence();
  const lastSaved = ref<SavedComposition | null>(null);
  const activeLoras = ref<CompositionEntry[]>([]);
  const basePrompt = ref('');
  const negativePrompt = ref('');
  const basePromptError = ref('');
  const isGenerating = ref(false);

  const finalPrompt = computed<string>(() => buildFinalPrompt(basePrompt.value, activeLoras.value));
  const canGenerate = computed<boolean>(() => !isGenerating.value);
  const canSave = computed<boolean>(() => activeLoras.value.length > 0);

  const setBasePrompt = (value: string) => {
    basePrompt.value = value;
  };

  const setNegativePrompt = (value: string) => {
    negativePrompt.value = value;
  };

  const isInComposition = (id: AdapterSummary['id']): boolean => {
    return activeLoras.value.some((entry) => String(entry.id) === String(id));
  };

  const addToComposition = (lora: AdapterSummary): void => {
    if (isInComposition(lora.id)) {
      return;
    }

    activeLoras.value.push({ id: lora.id, name: lora.name, weight: PROMPT_COMPOSITION_DEFAULT_WEIGHT });
  };

  const removeFromComposition = (index: number): void => {
    if (index < 0 || index >= activeLoras.value.length) {
      return;
    }

    activeLoras.value.splice(index, 1);
  };

  const moveUp = (index: number): void => {
    if (index <= 0 || index >= activeLoras.value.length) {
      return;
    }

    const [item] = activeLoras.value.splice(index, 1);

    if (!item) {
      return;
    }

    activeLoras.value.splice(index - 1, 0, item);
  };

  const moveDown = (index: number): void => {
    if (index < 0 || index >= activeLoras.value.length - 1) {
      return;
    }

    const [item] = activeLoras.value.splice(index, 1);

    if (!item) {
      return;
    }

    activeLoras.value.splice(index + 1, 0, item);
  };

  const updateWeight = (index: number, weight: number): void => {
    if (index < 0 || index >= activeLoras.value.length) {
      return;
    }

    activeLoras.value[index].weight = normaliseWeight(weight);
  };

  const balanceWeights = (): void => {
    if (activeLoras.value.length === 0) {
      return;
    }

    activeLoras.value.forEach((entry) => {
      entry.weight = PROMPT_COMPOSITION_DEFAULT_WEIGHT;
    });
  };

  const duplicateComposition = (): void => {
    activeLoras.value = activeLoras.value.map((entry) => ({ ...entry }));
  };

  const clearComposition = (): void => {
    activeLoras.value = [];
  };

  const validate = (): boolean => {
    basePromptError.value = '';

    if (!basePrompt.value.trim()) {
      basePromptError.value = 'Base prompt is required';
      return false;
    }

    if (basePrompt.value.length > 1000) {
      basePromptError.value = 'Base prompt is too long';
      return false;
    }

    return true;
  };

  const copyPrompt = async (): Promise<boolean> => {
    return copyPromptToClipboard(finalPrompt.value || '');
  };

  const persistPayload = (payload: SavedComposition) => {
    lastSaved.value = payload;
    persistence.save(payload);
  };

  const saveComposition = (): void => {
    const payload: SavedComposition = {
      items: activeLoras.value.map((entry) => ({ ...entry })),
      base: basePrompt.value,
      neg: negativePrompt.value,
    };

    persistPayload(payload);
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

    activeLoras.value = parsed.items.map((entry) => ({ ...entry }));
    basePrompt.value = parsed.base;
    negativePrompt.value = parsed.neg;
    basePromptError.value = '';
    lastSaved.value = parsed;
  };

  const generateImage = async (): Promise<boolean> => {
    if (!validate()) {
      return false;
    }

    isGenerating.value = true;

    try {
      const success = await triggerPromptGeneration({
        prompt: finalPrompt.value,
        negativePrompt: negativePrompt.value,
        loras: activeLoras.value,
      });

      return success;
    } finally {
      isGenerating.value = false;
    }
  };

  watch(
    [activeLoras, basePrompt, negativePrompt],
    ([items, base, neg]: [CompositionEntry[], string, string]) => {
      const payload: SavedComposition = {
        items: items.map((entry) => ({ ...entry })),
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
    catalog,
    activeLoras,
    basePrompt,
    negativePrompt,
    finalPrompt,
    basePromptError,
    isGenerating,
    canGenerate,
    canSave,
    addToComposition,
    removeFromComposition,
    moveUp,
    moveDown,
    updateWeight,
    balanceWeights,
    duplicateComposition,
    clearComposition,
    setBasePrompt,
    setNegativePrompt,
    copyPrompt,
    saveComposition,
    loadComposition,
    generateImage,
    isInComposition,
  };
};
