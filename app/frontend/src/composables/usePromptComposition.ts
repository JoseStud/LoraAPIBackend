import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';

import { useAdapterListApi } from '@/services/loraService';
import { createGenerationParams, requestGeneration } from '@/services/generationService';
import { copyToClipboard } from '@/utils/browser';

import type {
  AdapterSummary,
  CompositionEntry,
  SavedComposition,
  LoraListItem,
} from '@/types';

type PersistTimeout = ReturnType<typeof setTimeout> | null;

const STORAGE_KEY = 'prompt-composer-composition';
const DEFAULT_WEIGHT = 1;
const PERSIST_DEBOUNCE_MS = 250;

const formatWeightToken = (value: number | string | null | undefined): string => {
  const parsed = typeof value === 'number' ? value : Number(value);
  const numeric = Number.isFinite(parsed) ? parsed : DEFAULT_WEIGHT;
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

const toSavedComposition = (value: unknown): SavedComposition | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<SavedComposition> & { items?: unknown };
  const items = Array.isArray(record.items)
    ? record.items
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const entry = item as Partial<CompositionEntry>;

          if (typeof entry.id !== 'string' || typeof entry.name !== 'string') {
            return null;
          }

          const weight = typeof entry.weight === 'number' ? entry.weight : Number(entry.weight);
          const normalisedWeight = Number.isFinite(weight) ? weight : DEFAULT_WEIGHT;

          return {
            id: entry.id,
            name: entry.name,
            weight: normalisedWeight,
          } satisfies CompositionEntry;
        })
        .filter((entry): entry is CompositionEntry => entry !== null)
    : [];

  const base = typeof record.base === 'string' ? record.base : '';
  const neg = typeof record.neg === 'string' ? record.neg : '';

  return { items, base, neg };
};

const normaliseWeight = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_WEIGHT;
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
  searchTerm: Ref<string>;
  activeOnly: Ref<boolean>;
  filteredLoras: ComputedRef<AdapterSummary[]>;
  isLoading: Ref<boolean>;
  error: Ref<unknown>;
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
  setSearchTerm: (value: string) => void;
  setActiveOnly: (value: boolean) => void;
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
  const lastSaved = ref<SavedComposition | null>(null);
  const loras = ref<AdapterSummary[]>([]);
  const searchTerm = ref<string>('');
  const activeOnly = ref<boolean>(false);
  const { adapters, error, isLoading, fetchData: loadLoras } = useAdapterListApi({ page: 1, perPage: 200 });
  const activeLoras = ref<CompositionEntry[]>([]);
  const basePrompt = ref<string>('');
  const negativePrompt = ref<string>('');
  const basePromptError = ref<string>('');
  const isGenerating = ref<boolean>(false);
  let persistTimeout: PersistTimeout = null;

  const filteredLoras = computed<AdapterSummary[]>(() => {
    const term = searchTerm.value.trim().toLowerCase();
    let items = loras.value;

    if (activeOnly.value) {
      items = items.filter((item) => item.active);
    }

    if (term) {
      items = items.filter((item) => item.name.toLowerCase().includes(term));
    }

    return items;
  });

  const finalPrompt = computed<string>(() => buildFinalPrompt(basePrompt.value, activeLoras.value));
  const canGenerate = computed<boolean>(() => !isGenerating.value);
  const canSave = computed<boolean>(() => activeLoras.value.length > 0);

  const cancelScheduledPersist = () => {
    if (persistTimeout !== null) {
      clearTimeout(persistTimeout);
      persistTimeout = null;
    }
  };

  const persistComposition = (payload: SavedComposition): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to persist composition', err);
      }
    }
  };

  const schedulePersist = (payload: SavedComposition): void => {
    cancelScheduledPersist();
    persistTimeout = setTimeout(() => {
      persistTimeout = null;
      persistComposition(payload);
    }, PERSIST_DEBOUNCE_MS);
  };

  const setSearchTerm = (value: string) => {
    searchTerm.value = value;
  };

  const setActiveOnly = (value: boolean) => {
    activeOnly.value = value;
  };

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

    activeLoras.value.push({ id: lora.id, name: lora.name, weight: DEFAULT_WEIGHT });
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
      entry.weight = DEFAULT_WEIGHT;
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
    try {
      const success = await copyToClipboard(finalPrompt.value || '');

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

  const saveComposition = (): void => {
    const payload: SavedComposition = {
      items: activeLoras.value.map((entry) => ({ ...entry })),
      base: basePrompt.value,
      neg: negativePrompt.value,
    };

    lastSaved.value = payload;

    cancelScheduledPersist();
    persistComposition(payload);
  };

  const loadComposition = (): void => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      let payload: SavedComposition | null = null;

      if (raw) {
        payload = toSavedComposition(JSON.parse(raw) as unknown);
      } else if (lastSaved.value) {
        payload = lastSaved.value;
      }

      if (!payload) {
        return;
      }

      activeLoras.value = payload.items.map((entry) => ({ ...entry }));
      basePrompt.value = payload.base;
      negativePrompt.value = payload.neg;
      basePromptError.value = '';
      lastSaved.value = payload;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to load composition', err);
      }
    }
  };

  const generateImage = async (): Promise<boolean> => {
    if (!validate()) {
      return false;
    }

    isGenerating.value = true;

    try {
      const trimmedNegative = negativePrompt.value.trim();
      const params = createGenerationParams({
        prompt: finalPrompt.value,
        negative_prompt: trimmedNegative ? trimmedNegative : null,
      });

      await requestGeneration({
        ...params,
        loras: activeLoras.value.map((entry) => ({ ...entry })),
      });
      return true;
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to trigger generation', err);
      }
      return false;
    } finally {
      isGenerating.value = false;
    }
  };

  onMounted(async () => {
    await loadLoras();
  });

  watch(
    adapters,
    (next: LoraListItem[] | undefined) => {
      const items = Array.isArray(next) ? next : [];

      loras.value = items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        active: item.active ?? true,
      }));
    },
    { immediate: true },
  );

  watch(
    [activeLoras, basePrompt, negativePrompt],
    ([items, base, neg]: [CompositionEntry[], string, string]) => {
      const payload: SavedComposition = {
        items: items.map((entry) => ({ ...entry })),
        base,
        neg,
      };

      lastSaved.value = payload;
      schedulePersist(payload);
    },
    { deep: true },
  );

  onBeforeUnmount(() => {
    cancelScheduledPersist();
  });

  return {
    searchTerm,
    activeOnly,
    filteredLoras,
    isLoading,
    error,
    activeLoras,
    basePrompt,
    negativePrompt,
    finalPrompt,
    basePromptError,
    isGenerating,
    canGenerate,
    canSave,
    setSearchTerm,
    setActiveOnly,
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

