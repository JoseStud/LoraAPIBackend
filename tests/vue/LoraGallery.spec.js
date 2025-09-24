import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LoraGallery from '@/components/lora-gallery/LoraGallery.vue';
import LoraCard from '@/components/lora-gallery/LoraCard.vue';

const mocks = vi.hoisted(() => ({
  fetchAdaptersMock: vi.fn(),
  fetchAdapterTagsMock: vi.fn(),
  performBulkLoraActionMock: vi.fn(),
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

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await wrapper.vm.performBulkAction('activate');
    await flushPromises();

    expect(mocks.performBulkLoraActionMock).toHaveBeenCalledWith('/api/v1', {
      action: 'activate',
      lora_ids: ['1'],
    });
    expect(wrapper.vm.selectedCount).toBe(0);

    confirmSpy.mockRestore();
  });
});
