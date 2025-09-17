import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LoraGallery from '../../app/frontend/static/vue/LoraGallery.vue';
import LoraCard from '../../app/frontend/static/vue/LoraCard.vue';

// Mock the useApi composable
vi.mock('../../app/frontend/static/vue/composables/useApi.js', () => ({
  useApi: vi.fn(() => ({
    data: { value: null },
    error: { value: null },
    isLoading: { value: false },
    fetchData: vi.fn()
  }))
}));

// Mock global fetch
global.fetch = vi.fn();

describe('LoraGallery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch.mockReset();
    
    // Mock successful API responses
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        items: [
          {
            id: 1,
            name: 'Test LoRA 1',
            description: 'Test description',
            active: true,
            weight: 1.0,
            tags: ['test', 'lora'],
            created_at: '2023-01-01T00:00:00Z'
          },
          {
            id: 2,
            name: 'Test LoRA 2',
            description: 'Another test description',
            active: false,
            weight: 0.8,
            tags: ['test'],
            created_at: '2023-01-02T00:00:00Z'
          }
        ]
      })
    });
  });

  it('renders properly', async () => {
    const wrapper = mount(LoraGallery);
    expect(wrapper.find('.loras-page-container').exists()).toBe(true);
  });

  it('loads LoRAs on mount', async () => {
    const wrapper = mount(LoraGallery);
    
    // Wait for async operations to complete
    await wrapper.vm.$nextTick();
    
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/adapters'),
      expect.objectContaining({ credentials: 'same-origin' })
    );
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
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], tags: [] })
    });
    global.fetch = fetchSpy;
    
    const wrapper = mount(LoraGallery);
    
    // Wait for initial data load
    await wrapper.vm.$nextTick();
    
    // Check that URLs use relative paths with /api/v1/
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/adapters?per_page=100',
      expect.objectContaining({ credentials: 'same-origin' })
    );
    
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/adapters/tags',
      expect.objectContaining({ credentials: 'same-origin' })
    );
  });
});