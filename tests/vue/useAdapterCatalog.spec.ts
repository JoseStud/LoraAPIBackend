import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, reactive, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const adaptersRef = ref([] as any[]);
const queryState = reactive({ page: 1, perPage: 200 });

const fetchData = vi.fn(async (overrides: Record<string, unknown> = {}) => {
  Object.assign(queryState, overrides);
  adaptersRef.value = [
    { id: 'alpha', name: 'Alpha', description: 'First adapter', active: true },
    { id: 'beta', name: 'Beta', description: 'Second adapter', active: false },
  ];
  return adaptersRef.value;
});

const cancelActiveRequest = vi.fn();

vi.mock('@/composables/shared', async () => {
  const actual = await vi.importActual('@/composables/shared');
  return {
    ...actual,
    useAdapterListApi: vi.fn(() => ({
      fetchData,
      query: queryState,
      cancelActiveRequest,
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
    setActivePinia(createPinia());
    adaptersRef.value = [];
    queryState.page = 1;
    queryState.perPage = 200;
    fetchData.mockClear();
    cancelActiveRequest.mockClear();
  });

  it('fetches adapters and filters them', async () => {
    const state = withSetup();
    await flush();

    expect(fetchData).toHaveBeenCalledTimes(1);
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

  it('only fetches once for multiple subscribers', async () => {
    const first = withSetup();
    await flush();

    const second = withSetup();
    await flush();

    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(first.adapters.value).toHaveLength(2);
    expect(second.adapters.value).toHaveLength(2);
  });
});
