import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LoraGallery from '@/components/lora-gallery/LoraGallery.vue';
import LoraCard from '@/components/lora-gallery/LoraCard.vue';

const mocks = vi.hoisted(() => ({
  fetchAdaptersMock: vi.fn(),
  fetchAdapterTagsMock: vi.fn(),
  performBulkLoraActionMock: vi.fn(),
}));

const routerMocks = vi.hoisted(() => ({
  push: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({
    path: '/',
    query: {},
  }),
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

vi.mock('@/services', async () => {
  const actual = await vi.importActual('@/services');
  return {
    ...actual,
    fetchAdapters: mocks.fetchAdaptersMock,
    fetchAdapterTags: mocks.fetchAdapterTagsMock,
    performBulkLoraAction: mocks.performBulkLoraActionMock,
  };
});

vi.mock('@/composables/shared', async (importOriginal) => {
  const actual = await importOriginal();
  const { ref, reactive, computed } = await import('vue');

  return {
    ...actual,
    useDialogService: () => dialogServiceMocks,
    useNotifications: () => notificationMocks,
    useAdapterListApi: () => {
      const data = ref(null);
      const error = ref(null);
      const isLoading = ref(false);
      const query = reactive({ page: 1, perPage: 100 });
      const adapters = computed(() => {
        const payload = data.value;
        if (!payload) {
          return [];
        }
        if (Array.isArray(payload)) {
          return payload;
        }
        if (Array.isArray(payload.items)) {
          return payload.items;
        }
        return [];
      });

      const fetchData = async (overrides = {}) => {
        Object.assign(query, overrides);
        isLoading.value = true;
        try {
          const result = await mocks.fetchAdaptersMock('/api/v1', { ...query });
          data.value = result ?? [];
          error.value = null;
          return data.value;
        } catch (err) {
          error.value = err;
          throw err;
        } finally {
          isLoading.value = false;
        }
      };

      return {
        data,
        error,
        isLoading,
        query,
        adapters,
        fetchData,
      };
    },
  };
});

vi.mock('@/services/lora/loraService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchAdapterTags: mocks.fetchAdapterTagsMock,
    performBulkLoraAction: mocks.performBulkLoraActionMock,
  };
});

describe('LoraGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchAdaptersMock.mockResolvedValue([
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
    ]);
    mocks.fetchAdapterTagsMock.mockResolvedValue(['test', 'lora']);
    mocks.performBulkLoraActionMock.mockResolvedValue(undefined);
    dialogServiceMocks.confirm.mockClear();
    dialogServiceMocks.confirm.mockResolvedValue(true);
    routerMocks.push.mockClear();
  });

  const mountGallery = async () => {
    const wrapper = mount(LoraGallery);
    await flushPromises();
    return wrapper;
  };

  it('renders properly', async () => {
    const wrapper = await mountGallery();
    expect(wrapper.find('.loras-page-container').exists()).toBe(true);
  });

  it('loads LoRAs on mount', async () => {
    await mountGallery();
    expect(mocks.fetchAdaptersMock).toHaveBeenCalledWith('/api/v1', expect.objectContaining({ perPage: 100 }));
  });

  it('filters LoRAs by search term', async () => {
    const wrapper = await mountGallery();

    await wrapper.find('.search-input').setValue('Test LoRA 1');
    await flushPromises();

    expect(wrapper.findAllComponents(LoraCard)).toHaveLength(1);
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

    expect(mocks.fetchAdaptersMock).toHaveBeenCalledWith('/api/v1', expect.objectContaining({ perPage: 100 }));
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
