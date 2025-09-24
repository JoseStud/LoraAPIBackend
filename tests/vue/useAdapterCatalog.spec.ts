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

vi.mock('@/services', async () => {
  const actual = await vi.importActual('@/services');
  return {
    ...actual,
    useAdapterListApi: vi.fn(() => ({
      adapters: computed(() => adaptersRef.value),
      error: errorRef,
      isLoading: loadingRef,
      fetchData,
    })),
  };
});

import { useAdapterCatalog } from '@/composables/compose/useAdapterCatalog';

type CatalogReturn = ReturnType<typeof useAdapterCatalog>;

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

const withSetup = () => {
  let result: CatalogReturn;
  mount({
    template: '<div />',
    setup() {
      result = useAdapterCatalog();
      return result;
    },
  });
  return result!;
};

describe('useAdapterCatalog', () => {
  beforeEach(() => {
    adaptersRef.value = [];
    errorRef.value = null;
    loadingRef.value = false;
    fetchData.mockClear();
  });

  it('fetches adapters and filters them', async () => {
    const state = withSetup();
    await flush();

    expect(fetchData).toHaveBeenCalled();
    expect(state.adapters.value).toHaveLength(2);
    expect(state.adapters.value[1].active).toBe(false);

    state.setActiveOnly(true);
    await nextTick();
    expect(state.filteredAdapters.value).toHaveLength(1);
    expect(state.filteredAdapters.value[0].name).toBe('Alpha');

    state.setActiveOnly(false);
    await nextTick();

    state.setSearchTerm('beta');
    await nextTick();
    expect(state.filteredAdapters.value).toHaveLength(1);

    state.setActiveOnly(true);
    await nextTick();
    expect(state.filteredAdapters.value).toHaveLength(0);
  });

  it('refreshes adapters on demand', async () => {
    const state = withSetup();
    await flush();

    await state.refresh();
    expect(fetchData).toHaveBeenCalledTimes(2);
  });
});
