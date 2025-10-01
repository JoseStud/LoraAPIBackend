import { computed, ref, type ComputedRef, type Ref } from 'vue';

import { PROMPT_COMPOSITION_DEFAULT_WEIGHT } from '@/constants/promptComposer';

import type { AdapterSummary, CompositionEntry } from '@/types';

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

export interface PromptComposerStateBindings {
  activeLoras: Ref<CompositionEntry[]>;
  basePrompt: Ref<string>;
  negativePrompt: Ref<string>;
  basePromptError: Ref<string>;
  finalPrompt: ComputedRef<string>;
  canSave: ComputedRef<boolean>;
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
  isInComposition: (id: AdapterSummary['id']) => boolean;
  validate: () => boolean;
}

export const usePromptComposerState = (): PromptComposerStateBindings => {
  const activeLoras = ref<CompositionEntry[]>([]);
  const basePrompt = ref('');
  const negativePrompt = ref('');
  const basePromptError = ref('');

  const finalPrompt = computed<string>(() => buildFinalPrompt(basePrompt.value, activeLoras.value));
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

  return {
    activeLoras,
    basePrompt,
    negativePrompt,
    basePromptError,
    finalPrompt,
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
    isInComposition,
    validate,
  };
};
