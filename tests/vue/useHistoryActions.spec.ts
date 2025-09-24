import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { Router } from 'vue-router';

import type { GenerationHistoryResult } from '../../app/frontend/src/types';
import { useHistoryActions } from '../../app/frontend/src/composables/history/useHistoryActions';

const serviceMocks = vi.hoisted(() => ({
  rateResult: vi.fn(),
  favoriteResult: vi.fn(),
  favoriteResults: vi.fn(),
  downloadResult: vi.fn(),
  exportResults: vi.fn(),
  deleteResult: vi.fn(),
  deleteResults: vi.fn(),
}));

const downloadFileMock = vi.hoisted(() => vi.fn());

vi.mock('@/services', () => serviceMocks);
vi.mock('@/utils/browser', () => ({
  downloadFile: downloadFileMock,
}));

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

const createResult = (id: number): GenerationHistoryResult => ({
  id,
  prompt: `Prompt ${id}`,
  negative_prompt: null,
  image_url: `/image-${id}.png`,
  created_at: '2024-01-01T00:00:00Z',
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7,
  rating: 0,
  is_favorite: false,
  rating_updated_at: null,
  favorite_updated_at: null,
});

describe('useHistoryActions', () => {
  const apiBaseUrl = ref('/api');
  const routerPush = vi.fn();
  const routerMock = { push: routerPush } as unknown as Router;
  const applyFilters = vi.fn();
  const showToast = vi.fn();

  let selectedItems: Ref<Set<number>>;
  let selectedIds: ComputedRef<(string | number)[]>;
  let selectedCount: ComputedRef<number>;
  let clearSelection: ReturnType<typeof vi.fn>;
  let data: Ref<GenerationHistoryResult[]>;

  const setupActions = (confirmValue = true) =>
    useHistoryActions({
      apiBaseUrl,
      data,
      applyFilters,
      router: routerMock as unknown as any,
      showToast,
      selectedIds,
      selectedCount,
      clearSelection,
      withUpdatedSelection: (updater) => {
        const next = new Set(selectedItems.value);
        updater(next);
        selectedItems.value = next;
      },
      confirm: vi.fn(() => confirmValue),
    });

  beforeEach(() => {
    Object.values(serviceMocks).forEach((mockFn) => mockFn.mockReset());
    downloadFileMock.mockReset();
    routerPush.mockReset();
    applyFilters.mockReset();
    showToast.mockReset();

    if (originalLocalStorageDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorageDescriptor);
    } else {
      delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
    }

    selectedItems = ref(new Set<number>([1, 2]));
    selectedIds = computed(() => Array.from(selectedItems.value));
    selectedCount = computed(() => selectedItems.value.size);
    clearSelection = vi.fn(() => {
      selectedItems.value = new Set();
    });

    data = ref([createResult(1), createResult(2), createResult(3)]);
  });

  afterEach(() => {
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorageDescriptor);
    } else {
      delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
    }
  });

  it('updates rating and shows a success toast', async () => {
    const actions = setupActions();
    serviceMocks.rateResult.mockResolvedValueOnce(null);

    const result = data.value[0];
    const success = await actions.setRating(result, 5);

    expect(success).toBe(true);
    expect(serviceMocks.rateResult).toHaveBeenCalledWith('/api', 1, 5);
    expect(result.rating).toBe(5);
    expect(applyFilters).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('Rating updated successfully');
  });

  it('returns false when deletion is cancelled by confirmation dialog', async () => {
    const actions = setupActions(false);
    const success = await actions.deleteResult(1);

    expect(success).toBe(false);
    expect(serviceMocks.deleteResult).not.toHaveBeenCalled();
  });

  it('removes a single result and updates selection state', async () => {
    const actions = setupActions();
    serviceMocks.deleteResult.mockResolvedValueOnce(undefined);

    const success = await actions.deleteResult(1);

    expect(success).toBe(true);
    expect(serviceMocks.deleteResult).toHaveBeenCalledWith('/api', 1);
    expect(data.value.map((item) => item.id)).toEqual([2, 3]);
    expect(selectedIds.value).toEqual([2]);
    expect(showToast).toHaveBeenCalledWith('Image deleted successfully');
  });

  it('deletes selected results in bulk and clears the selection', async () => {
    const actions = setupActions();
    serviceMocks.deleteResults.mockResolvedValueOnce(undefined);

    const success = await actions.deleteSelected();

    expect(success).toBe(true);
    expect(serviceMocks.deleteResults).toHaveBeenCalledWith('/api', { ids: [1, 2] });
    expect(data.value.map((item) => item.id)).toEqual([3]);
    expect(clearSelection).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith('2 images deleted successfully');
  });

  it('saves parameters to localStorage and navigates to compose view', async () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', {
      setItem,
      getItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    });

    const actions = setupActions();
    const result = { ...data.value[0], sampler_name: 'sampler', model_name: 'model', loras: [] };

    const success = await actions.reuseParameters(result);

    expect(success).toBe(true);
    expect(setItem).toHaveBeenCalledWith(
      'reuse-parameters',
      expect.stringContaining('Prompt 1'),
    );
    expect(routerPush).toHaveBeenCalledWith({ name: 'compose' });
    expect(showToast).toHaveBeenCalledWith('Parameters copied to generation form');
  });
});
