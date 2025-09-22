import { describe, expect, beforeEach, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';

const adaptersRef = ref([] as any[]);
const errorRef = ref<unknown>(null);
const loadingRef = ref(false);
const fetchData = vi.fn(async () => {
  adaptersRef.value = [
    { id: 'alpha', name: 'Alpha', description: 'First adapter', active: true },
    { id: 'beta', name: 'Beta', description: 'Second adapter', active: false },
  ];
  return adaptersRef.value;
});

const generationServiceMock = vi.hoisted(() => ({
  createGenerationParams: vi.fn((payload: any) => payload),
  requestGeneration: vi.fn(async () => {}),
}));

const browserMock = vi.hoisted(() => ({
  copyToClipboard: vi.fn(async () => true),
}));

vi.mock('../../app/frontend/src/services/loraService', () => ({
  useAdapterListApi: vi.fn(() => ({
    adapters: computed(() => adaptersRef.value),
    error: errorRef,
    isLoading: loadingRef,
    fetchData,
  })),
}));

vi.mock('../../app/frontend/src/services/generationService', () => generationServiceMock);

vi.mock('../../app/frontend/src/utils/browser', () => browserMock);

const { createGenerationParams, requestGeneration } = generationServiceMock;
const { copyToClipboard } = browserMock;

import { usePromptComposition } from '../../app/frontend/src/composables/usePromptComposition';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

const withSetup = () => {
  let result: ReturnType<typeof usePromptComposition>;
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
    adaptersRef.value = [];
    errorRef.value = null;
    loadingRef.value = false;
    fetchData.mockClear();
    createGenerationParams.mockClear();
    requestGeneration.mockClear();
    copyToClipboard.mockClear();
    localStorage.clear();
  });

  it('loads adapters and filters them', async () => {
    const state = withSetup();
    await flush();

    expect(fetchData).toHaveBeenCalled();
    expect(state.filteredLoras.value).toHaveLength(2);

    state.setSearchTerm('beta');
    await nextTick();
    expect(state.filteredLoras.value).toHaveLength(1);
    expect(state.filteredLoras.value[0].name).toBe('Beta');

    state.setActiveOnly(true);
    await nextTick();
    expect(state.filteredLoras.value).toHaveLength(0);
  });

  it('builds final prompt, copies and generates', async () => {
    const state = withSetup();
    await flush();

    const first = state.filteredLoras.value[0];
    state.addToComposition(first);
    state.setBasePrompt('Shining stars');
    state.setNegativePrompt('blurry');
    await nextTick();

    expect(state.finalPrompt.value).toContain('Shining stars');
    expect(state.finalPrompt.value).toContain('<lora:Alpha:1.0>');

    await state.copyPrompt();
    expect(copyToClipboard).toHaveBeenCalledWith(state.finalPrompt.value);

    await state.generateImage();
    expect(createGenerationParams).toHaveBeenCalledWith({
      prompt: state.finalPrompt.value,
      negative_prompt: 'blurry',
    });
    expect(requestGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        loras: [expect.objectContaining({ id: 'alpha', weight: 1 })],
      }),
    );
  });

  it('persists and reloads compositions', async () => {
    const state = withSetup();
    await flush();

    const first = state.filteredLoras.value[0];
    state.addToComposition(first);
    state.setBasePrompt('Persist base');
    state.saveComposition();

    state.clearComposition();
    expect(state.activeLoras.value).toHaveLength(0);

    state.loadComposition();
    expect(state.activeLoras.value).toHaveLength(1);
    expect(state.basePrompt.value).toBe('Persist base');
  });
});

