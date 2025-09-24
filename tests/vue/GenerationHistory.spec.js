import { mount, shallowMount } from '@vue/test-utils';
import { defineComponent, nextTick, ref } from 'vue';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import GenerationHistory from '../../app/frontend/src/components/history/GenerationHistory.vue';
import GenerationHistoryController from '../../app/frontend/src/components/history/GenerationHistoryController.vue';
import GenerationHistoryView from '../../app/frontend/src/components/history/GenerationHistoryView.vue';
import HistoryModalController from '../../app/frontend/src/components/history/HistoryModalController.vue';
import HistoryToast from '../../app/frontend/src/components/history/HistoryToast.vue';
import { useGenerationHistory } from '../../app/frontend/src/composables/history/useGenerationHistory';
import { useHistoryModalCoordinator } from '../../app/frontend/src/composables/history/useHistoryModalCoordinator';

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
}));

const serviceMocks = vi.hoisted(() => ({
  listResults: vi.fn(),
  rateResult: vi.fn(),
  favoriteResult: vi.fn(),
  favoriteResults: vi.fn(),
  exportResults: vi.fn(),
  downloadResult: vi.fn(),
  deleteResult: vi.fn(),
  deleteResults: vi.fn(),
}));

vi.mock('../../app/frontend/src/services/historyService', () => ({
  listResults: serviceMocks.listResults,
  rateResult: serviceMocks.rateResult,
  favoriteResult: serviceMocks.favoriteResult,
  favoriteResults: serviceMocks.favoriteResults,
  exportResults: serviceMocks.exportResults,
  downloadResult: serviceMocks.downloadResult,
  deleteResult: serviceMocks.deleteResult,
  deleteResults: serviceMocks.deleteResults,
}));

vi.mock('../../app/frontend/src/services/history', () => ({
  listResults: serviceMocks.listResults,
  rateResult: serviceMocks.rateResult,
  favoriteResult: serviceMocks.favoriteResult,
  favoriteResults: serviceMocks.favoriteResults,
  exportResults: serviceMocks.exportResults,
  downloadResult: serviceMocks.downloadResult,
  deleteResult: serviceMocks.deleteResult,
  deleteResults: serviceMocks.deleteResults,
}));

vi.mock('../../app/frontend/src/utils/browser', () => ({
  downloadFile: vi.fn(),
}));

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

const sampleResults = [
  {
    id: 1,
    prompt: 'A serene landscape',
    negative_prompt: null,
    image_url: '/images/landscape.png',
    thumbnail_url: '/thumbs/landscape.png',
    created_at: '2024-01-01T10:00:00Z',
    width: 512,
    height: 512,
    steps: 25,
    cfg_scale: 7,
    seed: 12345,
    rating: 4,
    is_favorite: true,
    rating_updated_at: '2024-01-01T10:30:00Z',
    favorite_updated_at: '2024-01-01T10:45:00Z',
  },
  {
    id: 2,
    prompt: 'A playful cat',
    negative_prompt: null,
    image_url: '/images/cat.png',
    thumbnail_url: '/thumbs/cat.png',
    created_at: '2024-01-02T12:00:00Z',
    width: 768,
    height: 768,
    steps: 30,
    cfg_scale: 8,
    seed: 67890,
    rating: 5,
    is_favorite: false,
    rating_updated_at: '2024-01-02T13:00:00Z',
    favorite_updated_at: null,
  },
];

describe('useGenerationHistory', () => {
  beforeEach(() => {
    Object.values(serviceMocks).forEach((mockFn) => mockFn.mockReset());
    routerMock.push.mockReset();
  });

  it('loads initial results with query parameters and updates state', async () => {
    serviceMocks.listResults.mockResolvedValue({
      results: sampleResults,
      response: { has_more: true },
    });

    const apiBase = ref('/api');
    const history = useGenerationHistory({ apiBase, pageSize: 25 });

    await history.loadInitialResults();

    expect(serviceMocks.listResults).toHaveBeenCalledWith(
      '/api',
      expect.objectContaining({
        page: 1,
        page_size: 25,
        sort: 'created_at',
      }),
      expect.anything(),
    );
    expect(history.filteredResults.value).toHaveLength(2);
    expect(history.stats.value.total_results).toBe(2);
    expect(history.hasMore.value).toBe(true);
  });

  it('refetches when filters change and resets pagination', async () => {
    const moreResults = [
      {
        ...sampleResults[0],
        id: 3,
        prompt: 'Another image',
      },
    ];
    const filteredResults = [sampleResults[1]];

    serviceMocks.listResults
      .mockResolvedValueOnce({
        results: sampleResults,
        response: { has_more: true },
      })
      .mockResolvedValueOnce({
        results: moreResults,
        response: { has_more: false },
      })
      .mockResolvedValueOnce({
        results: filteredResults,
        response: { has_more: false },
      });

    const apiBase = ref('/api');
    const history = useGenerationHistory({ apiBase });

    await history.loadInitialResults();
    await history.loadMore();

    expect(serviceMocks.listResults).toHaveBeenNthCalledWith(
      2,
      '/api',
      expect.objectContaining({
        page: 2,
        page_size: 50,
        sort: 'created_at',
      }),
      expect.anything(),
    );
    expect(history.currentPage.value).toBe(2);
    expect(history.filteredResults.value).toHaveLength(3);

    history.searchTerm.value = 'cat';
    history.sortBy.value = 'rating';
    history.dateFilter.value = 'week';
    history.ratingFilter.value = 5;
    history.dimensionFilter.value = '512x512';
    history.applyFilters();
    await flush();

    expect(serviceMocks.listResults).toHaveBeenNthCalledWith(
      3,
      '/api',
      expect.objectContaining({
        page: 1,
        page_size: 50,
        sort: 'rating',
        search: 'cat',
        min_rating: 5,
        date_filter: 'week',
        width: 512,
        height: 512,
      }),
      expect.anything(),
    );
    expect(history.currentPage.value).toBe(1);
    expect(history.hasMore.value).toBe(false);
    expect(history.filteredResults.value).toEqual(filteredResults);

    history.applyFilters();
    await flush();
    expect(serviceMocks.listResults).toHaveBeenCalledTimes(3);
  });

  it('computes stats locally when the API omits aggregate values', async () => {
    serviceMocks.listResults.mockResolvedValue({
      results: [
        {
          ...sampleResults[0],
          rating: 4,
          is_favorite: true,
          metadata: { size_bytes: 1_024 },
        },
        {
          ...sampleResults[1],
          rating: 2,
          is_favorite: false,
          metadata: { file_size: 2_048 },
        },
      ],
      response: { has_more: false },
    });

    const history = useGenerationHistory({ apiBase: ref('/api') });

    await history.loadInitialResults();

    expect(history.stats.value).toEqual({
      total_results: 2,
      avg_rating: 3,
      total_favorites: 1,
      total_size: 3_072,
    });
  });

  it('prefers server provided stats when available', async () => {
    serviceMocks.listResults.mockResolvedValue({
      results: sampleResults,
      response: { has_more: false },
      stats: {
        total_results: 42,
        avg_rating: 4.5,
        total_favorites: 7,
        total_size: 12_345,
      },
    });

    const history = useGenerationHistory({ apiBase: ref('/api') });

    await history.loadInitialResults();

    expect(history.stats.value).toEqual({
      total_results: 42,
      avg_rating: 4.5,
      total_favorites: 7,
      total_size: 12_345,
    });
  });

  it('preserves array identity when appending additional pages', async () => {
    const firstPage = sampleResults.map((result) => ({ ...result }));
    const secondPage = [
      {
        ...sampleResults[0],
        id: 99,
        prompt: 'Fresh entry',
      },
    ];

    serviceMocks.listResults
      .mockResolvedValueOnce({
        results: firstPage,
        response: { has_more: true },
      })
      .mockResolvedValueOnce({
        results: secondPage,
        response: { has_more: false },
      });

    const history = useGenerationHistory({ apiBase: ref('/api') });

    await history.loadInitialResults();
    const initialReference = history.filteredResults.value;

    await history.loadMore();

    expect(history.filteredResults.value).toBe(initialReference);
    expect(history.filteredResults.value).toHaveLength(3);
    expect(history.hasMore.value).toBe(false);
  });
});

describe('useHistoryModalCoordinator', () => {
  it('tracks modal visibility and toast state', () => {
    let coordinator;
    const wrapper = mount(
      defineComponent({
        setup() {
          coordinator = useHistoryModalCoordinator();
          return () => null;
        },
      }),
    );

    expect(coordinator.modalVisible.value).toBe(false);
    expect(coordinator.activeResult.value).toBeNull();

    coordinator.openModal(sampleResults[0]);
    expect(coordinator.modalVisible.value).toBe(true);
    expect(coordinator.activeResult.value).toEqual(sampleResults[0]);

    coordinator.showToast('Failed', 'error');
    expect(coordinator.toastVisible.value).toBe(true);
    expect(coordinator.toastMessage.value).toBe('Failed');
    expect(coordinator.toastType.value).toBe('error');

    coordinator.closeModal();
    expect(coordinator.modalVisible.value).toBe(false);
    expect(coordinator.activeResult.value).toBeNull();

    wrapper.unmount();
  });
});

describe('GenerationHistoryView', () => {
  const baseProps = {
    isInitialized: true,
    viewMode: 'grid',
    sortBy: 'created_at',
    selectedCount: 1,
    searchTerm: '',
    dateFilter: 'all',
    ratingFilter: 0,
    dimensionFilter: 'all',
    stats: {
      total_results: sampleResults.length,
      avg_rating: 4.5,
      total_favorites: 1,
      total_size: 0,
    },
    results: sampleResults,
    selectedSet: new Set([1]),
    isLoading: false,
    hasMore: true,
    formatDate: (value) => value,
  };

  it('renders loading state when initialization is pending', () => {
    const wrapper = shallowMount(GenerationHistoryView, {
      props: { ...baseProps, isInitialized: false },
    });

    expect(wrapper.text()).toContain('Loading history...');
  });

  it('re-emits toolbar and filter interactions', () => {
    const wrapper = shallowMount(GenerationHistoryView, {
      props: baseProps,
    });

    const toolbar = wrapper.getComponent({ name: 'HistoryActionToolbar' });
    toolbar.vm.$emit('update:viewMode', 'list');
    toolbar.vm.$emit('update:sortBy', 'rating');
    toolbar.vm.$emit('sort-change');

    expect(wrapper.emitted('update:viewMode')?.[0]).toEqual(['list']);
    expect(wrapper.emitted('update:sortBy')?.[0]).toEqual(['rating']);
    expect(wrapper.emitted('sort-change')).toHaveLength(1);

    const filters = wrapper.getComponent({ name: 'HistoryFilters' });
    filters.vm.$emit('update:searchTerm', 'cat');
    filters.vm.$emit('update:dateFilter', 'week');
    filters.vm.$emit('update:ratingFilter', 5);
    filters.vm.$emit('update:dimensionFilter', '512x512');
    filters.vm.$emit('search');
    filters.vm.$emit('change');

    expect(wrapper.emitted('update:searchTerm')?.[0]).toEqual(['cat']);
    expect(wrapper.emitted('update:dateFilter')?.[0]).toEqual(['week']);
    expect(wrapper.emitted('update:ratingFilter')?.[0]).toEqual([5]);
    expect(wrapper.emitted('update:dimensionFilter')?.[0]).toEqual(['512x512']);
    expect(wrapper.emitted('search')).toHaveLength(1);
    expect(wrapper.emitted('filters-change')).toHaveLength(1);
  });

  it('emits result interactions from child lists', () => {
    const wrapper = shallowMount(GenerationHistoryView, {
      props: baseProps,
    });

    const grid = wrapper.getComponent({ name: 'HistoryGrid' });
    grid.vm.$emit('selection-change', { ids: [1] });
    grid.vm.$emit('view', sampleResults[0]);
    grid.vm.$emit('download', sampleResults[0]);
    grid.vm.$emit('toggle-favorite', sampleResults[0]);
    grid.vm.$emit('reuse', sampleResults[0]);
    grid.vm.$emit('rate', { result: sampleResults[0], rating: 5 });

    expect(wrapper.emitted('selection-change')?.[0]).toEqual([{ ids: [1] }]);
    expect(wrapper.emitted('view-result')?.[0]).toEqual([sampleResults[0]]);
    expect(wrapper.emitted('download-result')?.[0]).toEqual([sampleResults[0]]);
    expect(wrapper.emitted('toggle-favorite')?.[0]).toEqual([sampleResults[0]]);
    expect(wrapper.emitted('reuse')?.[0]).toEqual([sampleResults[0]]);
    expect(wrapper.emitted('rate')?.[0]).toEqual([{ result: sampleResults[0], rating: 5 }]);

    const bulk = wrapper.getComponent({ name: 'HistoryBulkActions' });
    bulk.vm.$emit('favorite');
    bulk.vm.$emit('export');
    bulk.vm.$emit('clear');

    expect(wrapper.emitted('favorite-selected')).toHaveLength(1);
    expect(wrapper.emitted('export-selected')).toHaveLength(1);
    expect(wrapper.emitted('clear-selection')).toHaveLength(1);

    wrapper.find('button.btn-secondary').trigger('click');
    expect(wrapper.emitted('load-more')).toHaveLength(1);
  });
});

describe('GenerationHistoryController', () => {
  beforeEach(() => {
    Object.values(serviceMocks).forEach((mockFn) => mockFn.mockReset());
    routerMock.push.mockReset();
    localStorage.clear();
  });

  it('loads data on mount and exposes reactive state', async () => {
    serviceMocks.listResults.mockResolvedValue({
      results: sampleResults,
      response: { has_more: true },
    });

    let slotProps;
    const wrapper = mount(GenerationHistoryController, {
      slots: {
        default: (props) => {
          slotProps = props;
          return null;
        },
      },
    });

    await flush();

    expect(slotProps.state.isInitialized.value).toBe(true);
    expect(slotProps.state.filteredResults.value).toHaveLength(2);

    slotProps.actions.updateViewMode('list');
    expect(slotProps.state.viewMode.value).toBe('list');
    await nextTick();
    expect(localStorage.getItem('history-view-mode')).toBe('list');

    await slotProps.actions.loadMore();
    expect(serviceMocks.listResults).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });

  it('surfaces API failures through modal toast state', async () => {
    serviceMocks.listResults.mockRejectedValue(new Error('failed to load'));

    let slotProps;
    mount(GenerationHistoryController, {
      slots: {
        default: (props) => {
          slotProps = props;
          return null;
        },
      },
    });

    await flush();

    expect(slotProps.modal.toastVisible.value).toBe(true);
    expect(slotProps.modal.toastMessage.value).toBe('failed to load');
  });

  it('handles modal actions via dedicated helpers', async () => {
    serviceMocks.listResults.mockResolvedValue({
      results: sampleResults,
      response: { has_more: false },
    });
    serviceMocks.downloadResult.mockResolvedValue({
      blob: new Blob(),
      filename: 'history.png',
    });
    serviceMocks.deleteResult.mockResolvedValue(true);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    let slotProps;
    const wrapper = mount(GenerationHistoryController, {
      slots: {
        default: (props) => {
          slotProps = props;
          return null;
        },
      },
    });

    await flush();

    slotProps.actions.showImageModal(sampleResults[0]);
    expect(slotProps.modal.modalVisible.value).toBe(true);

    await slotProps.actions.handleModalDownload(sampleResults[0]);
    expect(serviceMocks.downloadResult).toHaveBeenCalled();

    await slotProps.actions.handleModalDelete(sampleResults[0].id);
    expect(serviceMocks.deleteResult).toHaveBeenCalledWith(
      expect.any(String),
      sampleResults[0].id,
    );
    expect(slotProps.modal.modalVisible.value).toBe(false);

    wrapper.unmount();
    confirmSpy.mockRestore();
  });
});

describe('GenerationHistory.vue', () => {
  beforeEach(() => {
    Object.values(serviceMocks).forEach((mockFn) => mockFn.mockReset());
    routerMock.push.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders fetched history results', async () => {
    serviceMocks.listResults.mockResolvedValue({
      results: sampleResults,
      response: { has_more: false },
    });

    const wrapper = mount(GenerationHistory);
    await flush();

    expect(wrapper.text()).toContain('Generation History');
    expect(wrapper.text()).toContain('A serene landscape');
    expect(wrapper.text()).toContain('A playful cat');
    expect(wrapper.text()).toContain('512x512');
    expect(wrapper.text()).toContain('768x768');

    wrapper.unmount();
  });

  it('opens the history modal when an image is clicked', async () => {
    serviceMocks.listResults.mockResolvedValue({
      results: sampleResults,
      response: { has_more: false },
    });

    const wrapper = mount(GenerationHistory);
    await flush();

    const grid = wrapper.findComponent({ name: 'HistoryGrid' });
    grid.vm.$emit('view', sampleResults[0]);
    await nextTick();

    const modal = wrapper.findComponent(HistoryModalController);
    expect(modal.exists()).toBe(true);
    expect(modal.props('modalVisible')).toBe(true);

    wrapper.unmount();
  });

  it('shows an error toast when history loading fails', async () => {
    serviceMocks.listResults.mockRejectedValue(new Error('failed to load'));

    const wrapper = mount(GenerationHistory);
    await flush();

    const toast = wrapper.findComponent(HistoryToast);
    expect(toast.exists()).toBe(true);
    expect(toast.text()).toContain('failed to load');

    wrapper.unmount();
  });

  it('stores parameters and redirects to compose when reuse is triggered', async () => {
    serviceMocks.listResults.mockResolvedValue({
      results: sampleResults,
      response: { has_more: false },
    });

    const setItemSpy = vi.spyOn(Object.getPrototypeOf(window.localStorage), 'setItem');

    const wrapper = mount(GenerationHistory);
    await flush();

    const grid = wrapper.findComponent({ name: 'HistoryGrid' });
    grid.vm.$emit('reuse', sampleResults[0]);
    await nextTick();

    expect(setItemSpy).toHaveBeenCalledWith('reuse-parameters', expect.any(String));
    expect(routerMock.push).toHaveBeenCalledWith({ name: 'compose' });

    setItemSpy.mockRestore();
    wrapper.unmount();
  });
});
