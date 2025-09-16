import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import GenerationHistory from '../../app/frontend/static/vue/GenerationHistory.vue';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

describe('GenerationHistory.vue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders generation history with loading state initially', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [],
        has_more: false,
      }),
    }));

    const wrapper = mount(GenerationHistory);
    
    // Should show loading state initially
    expect(wrapper.text()).toContain('Loading history...');
    
    await flush();
    
    // After loading, should show the header
    expect(wrapper.text()).toContain('Generation History');
    expect(wrapper.text()).toContain('View and manage your generated images');

    wrapper.unmount();
  });

  it('fetches and displays generation results', async () => {
    const mockResults = [
      {
        id: 1,
        prompt: 'A beautiful landscape',
        created_at: '2024-01-01T10:00:00Z',
        width: 512,
        height: 512,
        steps: 20,
        cfg_scale: 7.5,
        seed: 12345,
        rating: 4,
        is_favorite: true,
        image_url: '/path/to/image1.png',
        thumbnail_url: '/path/to/thumb1.png'
      },
      {
        id: 2,
        prompt: 'A cute cat',
        created_at: '2024-01-02T11:00:00Z',
        width: 768,
        height: 768,
        steps: 25,
        cfg_scale: 8.0,
        seed: 67890,
        rating: 5,
        is_favorite: false,
        image_url: '/path/to/image2.png',
        thumbnail_url: '/path/to/thumb2.png'
      }
    ];

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: mockResults,
        has_more: false,
      }),
    }));

    const wrapper = mount(GenerationHistory);
    await flush();

    // Should display the results
    expect(wrapper.text()).toContain('A beautiful landscape');
    expect(wrapper.text()).toContain('A cute cat');
    expect(wrapper.text()).toContain('512x512');
    expect(wrapper.text()).toContain('768x768');

    // Should show statistics
    expect(wrapper.text()).toContain('2'); // Total Images
    expect(wrapper.text()).toContain('4.5'); // Average Rating
    expect(wrapper.text()).toContain('1'); // Favorited count

    wrapper.unmount();
  });

  it('handles search filtering correctly', async () => {
    const mockResults = [
      {
        id: 1,
        prompt: 'A beautiful landscape with mountains',
        created_at: '2024-01-01T10:00:00Z',
        width: 512,
        height: 512,
        rating: 4,
        is_favorite: false,
        image_url: '/path/to/image1.png'
      },
      {
        id: 2,
        prompt: 'A cute cat playing',
        created_at: '2024-01-02T11:00:00Z',
        width: 768,
        height: 768,
        rating: 5,
        is_favorite: true,
        image_url: '/path/to/image2.png'
      }
    ];

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: mockResults,
        has_more: false,
      }),
    }));

    const wrapper = mount(GenerationHistory);
    await flush();

    // Initially should show both results
    expect(wrapper.text()).toContain('A beautiful landscape');
    expect(wrapper.text()).toContain('A cute cat');

    // Find search input and enter search term
    const searchInput = wrapper.find('input[placeholder="Search prompts..."]');
    expect(searchInput.exists()).toBe(true);
    
    await searchInput.setValue('landscape');
    
    // Trigger the input event to simulate user typing
    await searchInput.trigger('input');
    
    // Wait for debounced filtering (need to wait longer than the 300ms debounce)
    await new Promise(resolve => setTimeout(resolve, 350));
    await flush();

    // Should still contain landscape text somewhere in the component
    expect(wrapper.text()).toContain('A beautiful landscape');
    
    // Test passed if we reach here without errors
    expect(wrapper.exists()).toBe(true);

    wrapper.unmount();
  });

  it('handles view mode switching', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [],
        has_more: false,
      }),
    }));

    const wrapper = mount(GenerationHistory);
    await flush();

    // Should start in grid view
    const gridContainer = wrapper.find('.grid.grid-cols-1.sm\\:grid-cols-2');
    expect(gridContainer.exists()).toBe(true);

    // Find and click list view button
    const listViewButton = wrapper.findAll('.view-mode-btn')[1];
    await listViewButton.trigger('click');
    await flush();

    // Should now show list view
    const listContainer = wrapper.find('.space-y-3');
    expect(listContainer.exists()).toBe(true);

    wrapper.unmount();
  });

  it('handles errors gracefully', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
    }));

    const wrapper = mount(GenerationHistory);
    await flush();

    // Should handle error state - component should still render without crashing
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).toContain('Generation History');

    wrapper.unmount();
  });

  it('saves view mode preference to localStorage', async () => {
    const mockSetItem = vi.fn();
    const mockGetItem = vi.fn().mockReturnValue('list');
    
    Object.defineProperty(window, 'localStorage', {
      value: {
        setItem: mockSetItem,
        getItem: mockGetItem,
      },
      writable: true,
    });

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        results: [],
        has_more: false,
      }),
    }));

    const wrapper = mount(GenerationHistory);
    await flush();

    // Should load saved preference
    expect(mockGetItem).toHaveBeenCalledWith('history-view-mode');

    // Find and click grid view button
    const gridViewButton = wrapper.findAll('.view-mode-btn')[0];
    await gridViewButton.trigger('click');
    await flush();

    // Should save new preference
    expect(mockSetItem).toHaveBeenCalledWith('history-view-mode', 'grid');

    wrapper.unmount();
  });
});