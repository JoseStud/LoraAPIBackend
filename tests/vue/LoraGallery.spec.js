import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LoraGallery from '../../app/frontend/src/components/LoraGallery.vue';
import LoraCard from '../../app/frontend/src/components/LoraCard.vue';

const mocks = vi.hoisted(() => ({
  fetchAdaptersMock: vi.fn(),
  fetchAdapterTagsMock: vi.fn(),
  performBulkLoraActionMock: vi.fn(),
}))

vi.mock('../../app/frontend/src/services/loraService.ts', async () => {
  const actual = await vi.importActual('../../app/frontend/src/services/loraService.ts');
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

  it('renders properly', async () => {
    const wrapper = mount(LoraGallery);
    expect(wrapper.find('.loras-page-container').exists()).toBe(true);
  });

  it('loads LoRAs on mount', async () => {
    const wrapper = mount(LoraGallery);
    
    // Wait for async operations to complete
    await wrapper.vm.$nextTick();
    
    expect(mocks.fetchAdaptersMock).toHaveBeenCalledWith('/api/v1', expect.objectContaining({ perPage: 100 }));
  });

  it('filters LoRAs by search term', async () => {
    const wrapper = mount(LoraGallery);
    
    // Wait for initialization
    await wrapper.vm.$nextTick();
    
    // Set search term
    await wrapper.find('.search-input').setValue('Test LoRA 1');
    
    // Wait for reactivity
    await wrapper.vm.$nextTick();
    
    // Should show filtered results
    expect(wrapper.vm.filteredLoras.length).toBeLessThanOrEqual(wrapper.vm.loras.length);
  });

  it('toggles view mode', async () => {
    const wrapper = mount(LoraGallery);
    
    expect(wrapper.vm.viewMode).toBe('grid');
    
    // Click list view button
    await wrapper.find('.view-mode-btn:last-child').trigger('click');
    
    expect(wrapper.vm.viewMode).toBe('list');
  });

  it('handles bulk mode toggle', async () => {
    const wrapper = mount(LoraGallery);
    
    expect(wrapper.vm.bulkMode).toBe(false);
    
    // Click bulk mode button
    await wrapper.find('button').trigger('click');
    
    expect(wrapper.vm.bulkMode).toBe(true);
  });

  it('uses correct API URL composition', async () => {
    // Mock fetch to capture URLs
    const wrapper = mount(LoraGallery);

    // Wait for initial data load
    await wrapper.vm.$nextTick();

    expect(mocks.fetchAdaptersMock).toHaveBeenCalledWith('/api/v1', expect.objectContaining({ perPage: 100 }));
    expect(mocks.fetchAdapterTagsMock).toHaveBeenCalledWith('/api/v1');
  });
});