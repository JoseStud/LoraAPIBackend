import { describe, expect, beforeEach, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';

import type { AdapterSummary, SavedComposition } from '@/types';

const adapterSource = ref<AdapterSummary[]>([]);
const searchTermRef = ref('');
const activeOnlyRef = ref(false);
const isLoadingRef = ref(false);
const errorRef = ref<unknown>(null);

const filteredAdapters = computed(() => {
  const term = searchTermRef.value.trim().toLowerCase();
  return adapterSource.value.filter((item) => {
    if (activeOnlyRef.value && !item.active) {
      return false;
    }

    if (term) {
      return item.name.toLowerCase().includes(term);
    }

    return true;
  });
});

const setSearchTerm = vi.fn((value: string) => {
  searchTermRef.value = value;
});

const setActiveOnly = vi.fn((value: boolean) => {
  activeOnlyRef.value = value;
});

const refresh = vi.fn(async () => {
  return adapterSource.value;
});

const catalogModuleMock = vi.hoisted(() => ({
  useAdapterCatalog: vi.fn(),
}));

vi.mock('../../app/frontend/src/composables/useAdapterCatalog', () => catalogModuleMock);

const clipboardMock = vi.hoisted(() => ({
  copyPromptToClipboard: vi.fn(async () => true),
}));

vi.mock('../../app/frontend/src/utils/promptClipboard', () => clipboardMock);

const generationMock = vi.hoisted(() => ({
  triggerPromptGeneration: vi.fn(async () => true),
}));

vi.mock('../../app/frontend/src/utils/promptGeneration', () => generationMock);

const persistenceState = {
  saved: ref<SavedComposition | null>(null),
  load: vi.fn<[], SavedComposition | null>(),
  save: vi.fn<(payload: SavedComposition) => void>(),
  scheduleSave: vi.fn<(payload: SavedComposition) => void>(),
  cancel: vi.fn<[], void>(),
};

vi.mock('../../app/frontend/src/utils/promptCompositionPersistence', async () => {
  const actual = await vi.importActual<typeof import('../../app/frontend/src/utils/promptCompositionPersistence')>(
    '../../app/frontend/src/utils/promptCompositionPersistence',
  );

  return {
    ...actual,
    createPromptCompositionPersistence: vi.fn(() => ({
      load: persistenceState.load,
      save: persistenceState.save,
      scheduleSave: persistenceState.scheduleSave,
      cancel: persistenceState.cancel,
    })),
  };
});

import { usePromptComposition } from '../../app/frontend/src/composables/usePromptComposition';

type UsePromptCompositionReturn = ReturnType<typeof usePromptComposition>;

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

const withSetup = () => {
  let result: UsePromptCompositionReturn;
  mount({
    template: '<div />',
    setup() {
      result = usePromptComposition();
      return result;
    },
  });
  return result!;
};

describe('usePromptComposition', () => {
  beforeEach(() => {
    adapterSource.value = [
      { id: 'alpha', name: 'Alpha', description: 'First adapter', active: true },
      { id: 'beta', name: 'Beta', description: 'Second adapter', active: false },
    ];
    searchTermRef.value = '';
    activeOnlyRef.value = false;
    isLoadingRef.value = false;
    errorRef.value = null;
    setSearchTerm.mockClear();
    setActiveOnly.mockClear();
    refresh.mockClear();
    clipboardMock.copyPromptToClipboard.mockClear();
    generationMock.triggerPromptGeneration.mockClear();
    persistenceState.saved.value = null;
    persistenceState.load.mockImplementation(() => persistenceState.saved.value);
    persistenceState.save.mockImplementation((payload: SavedComposition) => {
      persistenceState.saved.value = payload;
    });
    persistenceState.scheduleSave.mockImplementation((payload: SavedComposition) => {
      persistenceState.saved.value = payload;
    });
    persistenceState.cancel.mockClear();
    persistenceState.load.mockClear();
    persistenceState.save.mockClear();
    persistenceState.scheduleSave.mockClear();
    persistenceState.cancel.mockClear();
    catalogModuleMock.useAdapterCatalog.mockReset();
    catalogModuleMock.useAdapterCatalog.mockImplementation(() => ({
      searchTerm: searchTermRef,
      activeOnly: activeOnlyRef,
      adapters: computed(() => adapterSource.value),
      filteredAdapters,
      isLoading: isLoadingRef,
      error: errorRef,
      setSearchTerm,
      setActiveOnly,
      refresh,
    }));
  });

  it('exposes catalog filters and updates composition weights', async () => {
    const state = withSetup();
    await flush();

    expect(catalogModuleMock.useAdapterCatalog).toHaveBeenCalled();
    expect(state.catalog.filteredAdapters.value).toHaveLength(2);

    state.catalog.setSearchTerm('beta');
    await nextTick();
    expect(state.catalog.filteredAdapters.value).toHaveLength(1);
    expect(state.catalog.filteredAdapters.value[0].name).toBe('Beta');

    state.catalog.setActiveOnly(true);
    await nextTick();
    expect(state.catalog.filteredAdapters.value).toHaveLength(0);

    const first = adapterSource.value[0];
    state.addToComposition(first);
    state.updateWeight(0, 5);
    expect(state.activeLoras.value[0].weight).toBe(2);
  });

  it('builds final prompt, copies and triggers generation through helpers', async () => {
    const state = withSetup();
    await flush();

    const first = adapterSource.value[0];
    state.addToComposition(first);
    state.setBasePrompt('Shining stars');
    state.setNegativePrompt('blurry');
    await nextTick();

    expect(state.finalPrompt.value).toContain('Shining stars');
    expect(state.finalPrompt.value).toContain('<lora:Alpha:1.0>');

    await state.copyPrompt();
    expect(clipboardMock.copyPromptToClipboard).toHaveBeenCalledWith(state.finalPrompt.value);

    await state.generateImage();
    expect(generationMock.triggerPromptGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: state.finalPrompt.value,
        negativePrompt: 'blurry',
        loras: expect.any(Array),
      }),
    );
  });

  it('persists and reloads compositions using persistence helper', async () => {
    const state = withSetup();
    await flush();

    const first = adapterSource.value[0];
    state.addToComposition(first);
    state.setBasePrompt('Persist base');
    state.saveComposition();

    expect(persistenceState.save).toHaveBeenCalled();

    state.clearComposition();
    expect(state.activeLoras.value).toHaveLength(0);

    persistenceState.load.mockReturnValueOnce(persistenceState.saved.value);

    state.loadComposition();
    expect(state.activeLoras.value).toHaveLength(1);
    expect(state.basePrompt.value).toBe('Persist base');
  });
});
