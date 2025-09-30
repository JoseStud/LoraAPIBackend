import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';

import type {
  PersistenceKey,
  UsePersistenceReturn,
} from '../../app/frontend/src/composables/shared/usePersistence';
import { PERSISTENCE_KEYS } from '../../app/frontend/src/composables/shared/usePersistence';
import type { GalleryLora } from '../../app/frontend/src/types';

const persistenceMocks = vi.hoisted(() => {
  const storage = new Map<string, string>();

  const getItem = vi.fn<(key: PersistenceKey) => string | null>(
    (key) => storage.get(key) ?? null,
  );
  const setItem = vi.fn<(key: PersistenceKey, value: string) => void>((key, value) => {
    storage.set(key, value);
  });
  const removeItem = vi.fn<(key: PersistenceKey) => void>((key) => {
    storage.delete(key);
  });

  function getJSONImplementation<T>(key: PersistenceKey, fallback: T): T {
    const value = storage.get(key);
    if (value == null) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  function setJSONImplementation<T>(key: PersistenceKey, value: T): void {
    setItem(key, JSON.stringify(value));
  }

  const getJSON = vi.fn(getJSONImplementation) as UsePersistenceReturn['getJSON'];
  const setJSON = vi.fn(setJSONImplementation) as UsePersistenceReturn['setJSON'];

  const mock: UsePersistenceReturn = {
    hasStorage: true,
    getItem,
    setItem,
    removeItem,
    getJSON,
    setJSON,
  };

  return { storage, mock };
});

vi.mock('@/composables/shared', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    usePersistence: () => persistenceMocks.mock,
  } satisfies Record<string, unknown>;
});

import { useLoraGallerySelection } from '../../app/frontend/src/composables/lora-gallery/useLoraGallerySelection';

describe('useLoraGallerySelection', () => {
  beforeEach(() => {
    persistenceMocks.storage.clear();
    persistenceMocks.mock.getItem.mockClear();
    persistenceMocks.mock.setItem.mockClear();
    persistenceMocks.mock.removeItem.mockClear();
    persistenceMocks.mock.getJSON.mockClear();
    persistenceMocks.mock.setJSON.mockClear();
  });

  it('persists view mode changes through usePersistence', () => {
    const filteredLoras = ref<GalleryLora[]>([]);

    const { viewMode, setViewMode } = useLoraGallerySelection(filteredLoras);

    setViewMode('list');

    expect(viewMode.value).toBe('list');
    expect(persistenceMocks.mock.setItem).toHaveBeenCalledWith(
      PERSISTENCE_KEYS.loraGalleryViewMode,
      'list',
    );
    expect(
      persistenceMocks.storage.get(PERSISTENCE_KEYS.loraGalleryViewMode),
    ).toBe('list');
  });

  it('restores persisted view mode when initialized', () => {
    const filteredLoras = ref<GalleryLora[]>([]);

    persistenceMocks.storage.set(PERSISTENCE_KEYS.loraGalleryViewMode, 'grid');

    const selection = useLoraGallerySelection(filteredLoras);

    selection.initializeSelection();

    expect(selection.viewMode.value).toBe('grid');
    expect(persistenceMocks.mock.getItem).toHaveBeenCalledWith(
      PERSISTENCE_KEYS.loraGalleryViewMode,
    );
  });

  it('ignores invalid persisted view mode values', () => {
    const filteredLoras = ref<GalleryLora[]>([]);

    persistenceMocks.storage.set(PERSISTENCE_KEYS.loraGalleryViewMode, 'invalid');

    const selection = useLoraGallerySelection(filteredLoras);

    selection.initializeSelection();

    expect(selection.viewMode.value).toBe('grid');
  });

  it('supports bulk selection toggles for the current dataset', async () => {
    const filteredLoras = ref<GalleryLora[]>([
      { id: 'a' } as GalleryLora,
      { id: 'b' } as GalleryLora,
    ]);

    const selection = useLoraGallerySelection(filteredLoras);

    selection.toggleSelectAll();
    expect(selection.allSelected.value).toBe(true);
    expect(selection.selectedLoras.value).toEqual(['a', 'b']);

    filteredLoras.value = [{ id: 'b' } as GalleryLora];
    await nextTick();

    expect(selection.selectedLoras.value).toEqual(['b']);

    selection.toggleSelectAll();
    expect(selection.selectedLoras.value).toEqual([]);
  });
});
