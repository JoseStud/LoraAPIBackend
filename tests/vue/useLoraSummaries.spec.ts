import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { mount } from '@vue/test-utils';

import type { AdapterListQuery, AdapterSummary } from '@/types';

vi.mock('@/features/lora/public', async () => {
  const actual = await vi.importActual<typeof import('@/features/lora/public')>('@/features/lora/public');
  return {
    ...actual,
    useAdapterSummaries: vi.fn(),
  };
});

import { useAdapterSummaries } from '@/features/lora/public';
import { useLoraSummaries } from '@/features/recommendations/composables/useLoraSummaries';

const useAdapterSummariesMock = vi.mocked(useAdapterSummaries);

describe('useLoraSummaries', () => {
  const summaries = ref<AdapterSummary[]>([]);
  const error = ref<unknown>(null);
  const isLoading = ref(false);
  const ensureLoaded = vi.fn<(query?: AdapterListQuery) => Promise<AdapterSummary[]>>();
  const refresh = vi.fn<(query?: AdapterListQuery) => Promise<AdapterSummary[]>>();

  const mountComposable = (options?: Parameters<typeof useLoraSummaries>[0]) => {
    let state: ReturnType<typeof useLoraSummaries> | undefined;
    const wrapper = mount({
      setup() {
        state = useLoraSummaries(options);
        return () => null;
      },
    });

    return { state: state!, destroy: () => wrapper.unmount() };
  };

  beforeEach(() => {
    summaries.value = [];
    error.value = null;
    isLoading.value = false;
    ensureLoaded.mockClear().mockResolvedValue([]);
    refresh.mockClear().mockResolvedValue([]);

    useAdapterSummariesMock.mockReturnValue({
      summaries: computed(() => summaries.value),
      error: computed(() => error.value),
      isLoading: computed(() => isLoading.value),
      ensureLoaded,
      refresh,
    });
  });

  it('loads summaries immediately by default', () => {
    mountComposable();

    expect(ensureLoaded).toHaveBeenCalledWith({ page: 1, perPage: 200 });
  });

  it('merges custom queries when loading summaries', async () => {
    ensureLoaded.mockResolvedValue([
      { id: 'alpha', name: 'Alpha', active: true },
    ] as never);

    const { state } = mountComposable({ initialQuery: { tag: 'featured' } });

    await state.load({ perPage: 50 });

    expect(ensureLoaded).toHaveBeenCalledWith({ page: 1, perPage: 50, tag: 'featured' });
  });

  it('exposes catalog derived state', () => {
    summaries.value = [{ id: 'alpha', name: 'Alpha', active: true } as never];
    error.value = new Error('boom');
    isLoading.value = true;

    const { state } = mountComposable();

    expect(state.loras.value).toEqual(summaries.value);
    expect(state.error.value).toBe(error.value);
    expect(state.isLoading.value).toBe(true);
  });

  it('supports manual refresh', async () => {
    const { state } = mountComposable({ autoLoad: false });

    await state.refresh({ page: 2 });

    expect(refresh).toHaveBeenCalledWith({ page: 2, perPage: 200 });
    expect(ensureLoaded).not.toHaveBeenCalled();
  });
});
