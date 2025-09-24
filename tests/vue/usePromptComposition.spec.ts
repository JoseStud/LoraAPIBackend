import { describe, expect, beforeEach, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';

import type { AdapterSummary, SavedComposition } from '@/types';
import type { AdapterCatalogApi } from '../../app/frontend/src/composables/compose/useAdapterCatalog';

import { usePromptComposition } from '../../app/frontend/src/composables/compose/usePromptComposition';
import { usePromptCompositionState } from '../../app/frontend/src/composables/prompt-composer/usePromptCompositionState';
import { usePromptCompositionPersistence } from '../../app/frontend/src/composables/prompt-composer/usePromptCompositionPersistence';
import { usePromptGenerationActions } from '../../app/frontend/src/composables/prompt-composer/usePromptGenerationActions';

type UsePromptCompositionReturn = ReturnType<typeof usePromptComposition>;

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
  useAdapterCatalog: vi.fn<[], AdapterCatalogApi>(),
}));

vi.mock('../../app/frontend/src/composables/compose/useAdapterCatalog', () => catalogModuleMock);

const servicesModuleMock = vi.hoisted(() => {
  const clipboard = { copy: vi.fn(async () => true) };
  const generator = { trigger: vi.fn(async () => true) };
  return {
    clipboard,
    generator,
    createPromptClipboardService: vi.fn(() => clipboard),
    createPromptGenerationService: vi.fn(() => generator),
  };
});

vi.mock('../../app/frontend/src/composables/prompt-composer/services', () => ({
  createPromptClipboardService: servicesModuleMock.createPromptClipboardService,
  createPromptGenerationService: servicesModuleMock.createPromptGenerationService,
}));

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

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

const mountComposable = <T>(factory: () => T) => {
  let bindings: T | undefined;
  const wrapper = mount({
    template: '<div />',
    setup() {
      bindings = factory();
      return {};
    },
  });

  return {
    bindings: bindings!,
    unmount: () => wrapper.unmount(),
  };
};

const withPromptComposition = (): UsePromptCompositionReturn => {
  let result: UsePromptCompositionReturn | undefined;
  mount({
    template: '<div />',
    setup() {
      result = usePromptComposition();
      return {};
    },
  });
  return result!;
};

describe('usePromptCompositionState', () => {
  it('tracks active LoRAs and builds the final prompt', () => {
    const state = usePromptCompositionState();

    const adapter: AdapterSummary = {
      id: 'alpha',
      name: 'Alpha',
      description: 'First adapter',
      active: true,
    };

    state.setBasePrompt('Shining stars');
    state.addToComposition(adapter);

    expect(state.activeLoras.value).toHaveLength(1);
    expect(state.finalPrompt.value).toContain('Shining stars');
    expect(state.finalPrompt.value).toContain('<lora:Alpha:1.0>');

    state.updateWeight(0, 0);
    expect(state.finalPrompt.value).toContain('<lora:Alpha:0.0>');
  });

  it('validates base prompt and normalises weights', () => {
    const state = usePromptCompositionState();

    expect(state.validate()).toBe(false);
    expect(state.basePromptError.value).toBe('Base prompt is required');

    state.setBasePrompt('x'.repeat(1200));
    expect(state.validate()).toBe(false);
    expect(state.basePromptError.value).toBe('Base prompt is too long');

    state.setBasePrompt('Valid');
    expect(state.validate()).toBe(true);

    const adapter: AdapterSummary = {
      id: 'beta',
      name: 'Beta',
      description: 'Second adapter',
      active: true,
    };
    state.addToComposition(adapter);
    state.updateWeight(0, 5);
    expect(state.activeLoras.value[0].weight).toBe(2);
  });
});

describe('usePromptCompositionPersistence', () => {
  beforeEach(() => {
    persistenceState.saved.value = null;
    persistenceState.load.mockReset();
    persistenceState.save.mockReset();
    persistenceState.scheduleSave.mockReset();
    persistenceState.cancel.mockReset();
  });

  it('saves, schedules and loads compositions', async () => {
    const activeLoras = ref([{ id: 'alpha', name: 'Alpha', weight: 1 }]);
    const basePrompt = ref('Base prompt');
    const negativePrompt = ref('');
    const basePromptError = ref('error');

    const { bindings, unmount } = mountComposable(() =>
      usePromptCompositionPersistence({
        activeLoras,
        basePrompt,
        negativePrompt,
        basePromptError,
        persistence: {
          load: persistenceState.load,
          save: persistenceState.save,
          scheduleSave: persistenceState.scheduleSave,
          cancel: persistenceState.cancel,
        },
      }),
    );

    bindings.saveComposition();
    expect(persistenceState.save).toHaveBeenCalledWith(
      expect.objectContaining({ base: 'Base prompt', items: expect.any(Array) }),
    );

    activeLoras.value.push({ id: 'beta', name: 'Beta', weight: 0.5 });
    await flush();
    expect(persistenceState.scheduleSave).toHaveBeenCalled();

    const stored: SavedComposition = {
      items: [{ id: 'gamma', name: 'Gamma', weight: 0.75 }],
      base: 'Loaded base',
      neg: 'Loaded negative',
    };
    persistenceState.load.mockReturnValueOnce(stored);

    bindings.loadComposition();
    expect(activeLoras.value).toHaveLength(1);
    expect(basePrompt.value).toBe('Loaded base');
    expect(negativePrompt.value).toBe('Loaded negative');
    expect(basePromptError.value).toBe('');

    unmount();
    expect(persistenceState.cancel).toHaveBeenCalled();
  });
});

describe('usePromptGenerationActions', () => {
  it('copies prompt and triggers generation when valid', async () => {
    const finalPrompt = ref('Prompt with token');
    const negativePrompt = ref('');
    const activeLoras = ref([{ id: 'alpha', name: 'Alpha', weight: 1 }]);
    const validate = vi.fn(() => true);
    const clipboard = { copy: vi.fn(async () => true) };
    const generator = { trigger: vi.fn(async () => true) };

    const { bindings } = mountComposable(() =>
      usePromptGenerationActions({
        finalPrompt,
        negativePrompt,
        activeLoras,
        validate,
        clipboard,
        generator,
      }),
    );

    await bindings.copyPrompt();
    expect(clipboard.copy).toHaveBeenCalledWith('Prompt with token');

    await bindings.generateImage();
    expect(validate).toHaveBeenCalled();
    expect(generator.trigger).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Prompt with token', loras: activeLoras.value }),
    );
  });

  it('aborts generation when validation fails', async () => {
    const { bindings } = mountComposable(() =>
      usePromptGenerationActions({
        finalPrompt: ref(''),
        negativePrompt: ref('no'),
        activeLoras: ref([]),
        validate: () => false,
      }),
    );

    const result = await bindings.generateImage();
    expect(result).toBe(false);
    expect(bindings.isGenerating.value).toBe(false);
  });
});

describe('usePromptComposition orchestrator', () => {
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
    servicesModuleMock.clipboard.copy.mockClear();
    servicesModuleMock.generator.trigger.mockClear();
    servicesModuleMock.createPromptClipboardService.mockClear();
    servicesModuleMock.createPromptGenerationService.mockClear();
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
    const state = withPromptComposition();
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

  it('builds final prompt, copies and triggers generation through services', async () => {
    const state = withPromptComposition();
    await flush();

    const first = adapterSource.value[0];
    state.addToComposition(first);
    state.setBasePrompt('Shining stars');
    state.setNegativePrompt('blurry');
    await nextTick();

    expect(state.finalPrompt.value).toContain('Shining stars');
    expect(state.finalPrompt.value).toContain('<lora:Alpha:1.0>');

    await state.copyPrompt();
    expect(servicesModuleMock.clipboard.copy).toHaveBeenCalledWith(state.finalPrompt.value);

    await state.generateImage();
    expect(servicesModuleMock.generator.trigger).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: state.finalPrompt.value,
        negativePrompt: 'blurry',
        loras: expect.any(Array),
      }),
    );
  });

  it('persists and reloads compositions using persistence helper', async () => {
    const state = withPromptComposition();
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
