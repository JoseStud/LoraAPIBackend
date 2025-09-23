import { mount } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import GenerationHistory from '../../app/frontend/src/components/GenerationHistory.vue';
import HistoryModal from '../../app/frontend/src/components/HistoryModal.vue';
import HistoryToast from '../../app/frontend/src/components/HistoryToast.vue';
import { useGenerationHistory } from '../../app/frontend/src/composables/useGenerationHistory';

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
  },
];

describe('useGenerationHistory', () => {
  beforeEach(() => {
    Object.values(serviceMocks).forEach((mockFn) => mockFn.mockReset());
    routerMock.push.mockReset();
  });

  it('loads results and applies filters', async () => {
    serviceMocks.listResults.mockResolvedValue({
      results: sampleResults,
      response: { has_more: false },
    });

    const apiBase = ref('/api');
    const history = useGenerationHistory({ apiBase });

    await history.loadInitialResults();
    expect(history.filteredResults.value).toHaveLength(2);
    expect(history.stats.total_results).toBe(2);

    history.searchTerm.value = 'cat';
    history.applyFilters();

    expect(history.filteredResults.value).toHaveLength(1);
    expect(history.filteredResults.value[0].prompt).toContain('cat');
    expect(history.stats.total_results).toBe(1);
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

    const firstImage = wrapper.find('img');
    await firstImage.trigger('click');
    await nextTick();

    const modal = wrapper.findComponent(HistoryModal);
    expect(modal.exists()).toBe(true);
    expect(modal.text()).toContain('Generation Details');

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

    const reuseButton = wrapper
      .findAll('button')
      .find((button) => button.attributes('class')?.includes('hover:text-blue-500'));

    expect(reuseButton).toBeTruthy();

    await reuseButton?.trigger('click');

    expect(setItemSpy).toHaveBeenCalledWith('reuse-parameters', expect.any(String));
    expect(routerMock.push).toHaveBeenCalledWith({ name: 'compose' });

    setItemSpy.mockRestore();
    wrapper.unmount();
  });
});
