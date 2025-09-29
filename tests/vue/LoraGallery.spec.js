import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import LoraGallery from '@/components/lora-gallery/LoraGallery.vue';
import LoraCard from '@/components/lora-gallery/LoraCard.vue';
import { useSettingsStore } from '@/stores/settings';

const mocks = vi.hoisted(() => ({
  fetchAdapterListMock: vi.fn(),
  fetchAdapterTagsMock: vi.fn(),
  performBulkLoraActionMock: vi.fn(),
}));

const route = reactive({
  path: '/',
  /** @type {Record<string, unknown>} */
  query: {},
});

const updateRouteFromPush = async (location = {}) => {
  const { path, query } = location;

  if (typeof path === 'string') {
    route.path = path;
  }

  if (query && typeof query === 'object') {
    Object.keys(route.query).forEach(key => {
      delete route.query[key];
    });
    Object.assign(route.query, query);
  }
};

const routerMocks = {
  push: vi.fn(updateRouteFromPush),
};

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => routerMocks,
  isNavigationFailure: () => false,
  NavigationFailureType: { duplicated: 'duplicated' },
}));

const dialogServiceMocks = vi.hoisted(() => ({
  confirm: vi.fn().mockResolvedValue(true),
  prompt: vi.fn(),
  state: {
    isOpen: false,
    type: null,
    title: '',
    message: '',
    description: '',
    confirmLabel: '',
    cancelLabel: '',
    inputLabel: '',
    placeholder: '',
    inputValue: '',
    requireValue: false,
  },
  confirmDialog: vi.fn(),
  cancelDialog: vi.fn(),
  updateInputValue: vi.fn(),
  isConfirmDisabled: { value: false },
}));

const notificationMocks = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showWarning: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('@/composables/shared', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useDialogService: () => dialogServiceMocks,
    useNotifications: () => notificationMocks,
  };
});

vi.mock('@/services/lora/loraService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchAdapterList: mocks.fetchAdapterListMock,
    fetchAdapterTags: mocks.fetchAdapterTagsMock,
    performBulkLoraAction: mocks.performBulkLoraActionMock,
  };
});

describe('LoraGallery', () => {
  let pinia;

  beforeEach(() => {
    vi.clearAllMocks();
    pinia = createPinia();
    setActivePinia(pinia);

    const settingsStore = useSettingsStore();
    settingsStore.reset();
    settingsStore.setSettings({ backendUrl: '/api/v1' });

    mocks.fetchAdapterListMock.mockImplementation(async (_baseUrl, query = {}) => ({
      items: [
        {
          id: '1',
          name: 'Test LoRA 1',
          description: 'Test description',
          active: true,
          weight: 1.0,
          tags: ['test', 'lora'],
          created_at: '2023-01-01T00:00:00Z',
        },
        {
          id: '2',
          name: 'Test LoRA 2',
          description: 'Another test description',
          active: false,
          weight: 0.8,
          tags: ['test'],
          created_at: '2023-01-02T00:00:00Z',
        },
      ],
      total: 2,
      filtered: 2,
      page: (query && query.page) || 1,
      pages: 1,
      per_page: (query && query.perPage) || 200,
    }));
    mocks.fetchAdapterTagsMock.mockResolvedValue(['test', 'lora']);
    mocks.performBulkLoraActionMock.mockResolvedValue(undefined);
    dialogServiceMocks.confirm.mockClear();
    dialogServiceMocks.confirm.mockResolvedValue(true);
    routerMocks.push.mockClear();
    routerMocks.push.mockImplementation(updateRouteFromPush);
    Object.keys(route.query).forEach(key => {
      delete route.query[key];
    });
    route.path = '/';
  });

  const mountGallery = async () => {
    const wrapper = mount(LoraGallery, { global: { plugins: [pinia] } });
    await flushPromises();
    return wrapper;
  };

  it('renders properly', async () => {
    const wrapper = await mountGallery();
    expect(wrapper.find('.loras-page-container').exists()).toBe(true);
  });

  it('loads LoRAs on mount', async () => {
    await mountGallery();
    expect(mocks.fetchAdapterListMock).toHaveBeenCalledWith(
      '/api/v1',
      expect.objectContaining({ perPage: 200 }),
    );
  });

  it('filters LoRAs by search term', async () => {
    const wrapper = await mountGallery();

    await wrapper.find('.search-input').setValue('Test LoRA 1');
    await flushPromises();

    expect(wrapper.findAllComponents(LoraCard)).toHaveLength(1);
  });

  it('initializes filters from the current route query', async () => {
    route.query.q = 'Test LoRA 1';

    const wrapper = await mountGallery();
    await flushPromises();

    expect(wrapper.vm.searchTerm).toBe('Test LoRA 1');
    expect(wrapper.findAllComponents(LoraCard)).toHaveLength(1);
  });

  it('updates filters when the route query changes', async () => {
    const wrapper = await mountGallery();

    route.query.q = 'Test LoRA 2';
    await flushPromises();

    expect(wrapper.vm.searchTerm).toBe('Test LoRA 2');
    expect(wrapper.findAllComponents(LoraCard)).toHaveLength(1);

    delete route.query.q;
    await flushPromises();

    expect(wrapper.vm.searchTerm).toBe('');
  });

  it('toggles view mode', async () => {
    const wrapper = await mountGallery();

    expect(wrapper.vm.viewMode).toBe('grid');

    const viewButtons = wrapper.findAll('.view-mode-btn');
    await viewButtons[1].trigger('click');
    await flushPromises();

    expect(wrapper.vm.viewMode).toBe('list');
  });

  it('handles bulk mode toggle and displays bulk bar', async () => {
    const wrapper = await mountGallery();

    expect(wrapper.vm.bulkMode).toBe(false);

    const bulkButton = wrapper.findAll('button').find(button => button.text() === 'Bulk Actions');
    expect(bulkButton).toBeDefined();
    if (!bulkButton) {
      throw new Error('Bulk button not found');
    }
    await bulkButton.trigger('click');
    await flushPromises();

    expect(wrapper.vm.bulkMode).toBe(true);
    expect(wrapper.find('.bulk-actions-bar').isVisible()).toBe(true);
  });

  it('uses correct API URL composition', async () => {
    await mountGallery();

    expect(mocks.fetchAdapterListMock).toHaveBeenCalledWith(
      '/api/v1',
      expect.objectContaining({ perPage: 200 }),
    );
    expect(mocks.fetchAdapterTagsMock).toHaveBeenCalledWith('/api/v1');
  });

  it('performs bulk actions using shared selection state', async () => {
    const wrapper = await mountGallery();

    expect(wrapper.vm.selectedCount).toBe(0);

    wrapper.vm.handleSelectionChange('1');
    await flushPromises();

    expect(wrapper.vm.selectedCount).toBe(1);
    expect(wrapper.vm.selectedLoras).toEqual(['1']);

    await wrapper.vm.performBulkAction('activate');
    await flushPromises();
    expect(mocks.performBulkLoraActionMock).toHaveBeenCalledWith('/api/v1', {
      action: 'activate',
      lora_ids: ['1'],
    });
    expect(wrapper.vm.selectedCount).toBe(0);
    expect(dialogServiceMocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Confirm Bulk Action',
        message: expect.stringContaining('activate 1 LoRA'),
      })
    );
  });
});
