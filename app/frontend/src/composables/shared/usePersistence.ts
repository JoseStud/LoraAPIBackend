import type { PersistenceKey } from '@/constants/persistence';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const resolveStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage ?? null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[usePersistence] Failed to access localStorage', error);
    }
    return null;
  }
};

export const usePersistence = (storage: StorageLike | null = resolveStorage()) => {
  const hasStorage = storage != null;

  const getItem = (key: PersistenceKey): string | null => {
    if (!storage) {
      return null;
    }

    try {
      return storage.getItem(key);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[usePersistence] Failed to read key', key, error);
      }
      return null;
    }
  };

  const setItem = (key: PersistenceKey, value: string): void => {
    if (!storage) {
      return;
    }

    try {
      storage.setItem(key, value);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[usePersistence] Failed to write key', key, error);
      }
    }
  };

  const removeItem = (key: PersistenceKey): void => {
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(key);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[usePersistence] Failed to remove key', key, error);
      }
    }
  };

  const getJSON = <T>(key: PersistenceKey, fallback: T): T => {
    const value = getItem(key);
    if (value == null) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[usePersistence] Failed to parse JSON for key', key, error);
      }
      return fallback;
    }
  };

  const setJSON = <T>(key: PersistenceKey, value: T): void => {
    try {
      setItem(key, JSON.stringify(value));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[usePersistence] Failed to stringify value for key', key, error);
      }
    }
  };

  return {
    hasStorage,
    getItem,
    setItem,
    removeItem,
    getJSON,
    setJSON,
  } as const;
};

export type UsePersistenceReturn = ReturnType<typeof usePersistence>;
