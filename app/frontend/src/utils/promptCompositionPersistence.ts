import { PROMPT_COMPOSITION_DEFAULT_WEIGHT, PROMPT_COMPOSITION_PERSIST_DEBOUNCE_MS, PROMPT_COMPOSITION_STORAGE_KEY } from '@/constants/promptComposer';

import type { CompositionEntry, SavedComposition } from '@/types';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PromptCompositionPersistenceOptions {
  storage?: StorageLike | null;
  storageKey?: string;
  debounceMs?: number;
}

export interface PromptCompositionPersistence {
  load: () => SavedComposition | null;
  save: (payload: SavedComposition) => void;
  scheduleSave: (payload: SavedComposition) => void;
  cancel: () => void;
}

type PersistTimeout = ReturnType<typeof setTimeout> | null;

const resolveStorage = (value?: StorageLike | null): StorageLike | null => {
  if (value) {
    return value;
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }

  return null;
};

const normaliseWeight = (value: number | string | null | undefined): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  const numeric = Number.isFinite(parsed) ? parsed : PROMPT_COMPOSITION_DEFAULT_WEIGHT;

  if (numeric < 0) {
    return 0;
  }

  if (numeric > 2) {
    return 2;
  }

  return numeric;
};

const toCompositionEntry = (value: unknown): CompositionEntry | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as Partial<CompositionEntry>;

  if (typeof input.id !== 'string' || typeof input.name !== 'string') {
    return null;
  }

  return {
    id: input.id,
    name: input.name,
    weight: normaliseWeight(input.weight ?? null),
  } satisfies CompositionEntry;
};

export const parseSavedComposition = (value: unknown): SavedComposition | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const input = value as Partial<SavedComposition> & { items?: unknown };
  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems
    .map(toCompositionEntry)
    .filter((entry): entry is CompositionEntry => entry !== null);

  return {
    items,
    base: typeof input.base === 'string' ? input.base : '',
    neg: typeof input.neg === 'string' ? input.neg : '',
  } satisfies SavedComposition;
};

export const createPromptCompositionPersistence = (
  options: PromptCompositionPersistenceOptions = {},
): PromptCompositionPersistence => {
  const storage = resolveStorage(options.storage);
  const storageKey = options.storageKey ?? PROMPT_COMPOSITION_STORAGE_KEY;
  const debounceMs = options.debounceMs ?? PROMPT_COMPOSITION_PERSIST_DEBOUNCE_MS;
  let timeout: PersistTimeout = null;

  const cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  const save = (payload: SavedComposition) => {
    if (!storage) {
      return;
    }

    try {
      storage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to persist composition', err);
      }
    }
  };

  const scheduleSave = (payload: SavedComposition) => {
    cancel();
    timeout = setTimeout(() => {
      timeout = null;
      save(payload);
    }, debounceMs);
  };

  const load = (): SavedComposition | null => {
    if (!storage) {
      return null;
    }

    try {
      const raw = storage.getItem(storageKey);
      if (!raw) {
        return null;
      }

      return parseSavedComposition(JSON.parse(raw) as unknown);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to load composition', err);
      }
      return null;
    }
  };

  return {
    load,
    save,
    scheduleSave,
    cancel,
  };
};
