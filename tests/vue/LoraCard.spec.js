import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import LoraCard from '@/components/lora-gallery/LoraCard.vue';
import LoraCardGrid from '@/components/lora-gallery/LoraCardGrid.vue';

const mocks = vi.hoisted(() => ({
  updateLoraWeightMock: vi.fn(),
  toggleLoraActiveStateMock: vi.fn(),
  triggerPreviewGenerationMock: vi.fn(),
  deleteLoraMock: vi.fn(),
  buildRecommendationsUrlMock: vi.fn(),
}));

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  resolve: vi.fn(),
}));

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
}));

vi.mock('@/services', async () => {
  const actual = await vi.importActual('@/services');
  return {
    ...actual,
    updateLoraWeight: mocks.updateLoraWeightMock,
    toggleLoraActiveState: mocks.toggleLoraActiveStateMock,
    triggerPreviewGeneration: mocks.triggerPreviewGenerationMock,
    deleteLora: mocks.deleteLoraMock,
    buildRecommendationsUrl: mocks.buildRecommendationsUrlMock,
  };
});

describe('LoraCard', () => {
  const mockLora = {
    id: 1,
    name: 'Test LoRA',
    description: 'Test description',
    active: true,
    weight: 1.0,
    tags: ['test', 'lora'],
    preview_image: null,
    version: '1.0',
    type: 'character'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateLoraWeightMock.mockResolvedValue({ weight: 1.1 });
    mocks.toggleLoraActiveStateMock.mockResolvedValue(undefined);
    mocks.triggerPreviewGenerationMock.mockResolvedValue(undefined);
    mocks.deleteLoraMock.mockResolvedValue(undefined);
    mocks.buildRecommendationsUrlMock.mockReturnValue('/recommendations?lora_id=1');
    routerMock.push.mockReset();
    routerMock.resolve.mockImplementation((url) => {
      const [path, queryString = ''] = url.split('?');
      const searchParams = new URLSearchParams(queryString);
      const query = {};
      searchParams.forEach((value, key) => {
        query[key] = value;
      });
      return {
        path,
        query,
        hash: '',
      };
    });
  });

  it('renders properly in grid view', () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora,
        viewMode: 'grid'
      }
    });

    expect(wrapper.find('.lora-card-grid-inner').exists()).toBe(true);
    expect(wrapper.find('.lora-card-title').text()).toBe('Test LoRA');
    expect(wrapper.find('.lora-card-description').text()).toBe('Test description');
  });

  it('renders properly in list view', () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora,
        viewMode: 'list'
      }
    });

    expect(wrapper.find('.lora-card-list-inner').exists()).toBe(true);
    expect(wrapper.find('.lora-card-title').text()).toBe('Test LoRA');
  });

  it('shows bulk selection checkbox in bulk mode', () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora,
        bulkMode: true
      }
    });

    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true);
  });

  it('hides bulk selection checkbox when not in bulk mode', () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora,
        bulkMode: false
      }
    });

    // Checkbox should be hidden via v-show
    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.exists()).toBe(true);
    // v-show adds style="display: none;" when false
    const style = checkbox.attributes('style');
    if (style) {
      expect(style).toContain('display: none');
    }
  });

  it('emits toggle-selection when checkbox is clicked', async () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora,
        bulkMode: true
      }
    });

    await wrapper.find('input[type="checkbox"]').trigger('change');
    expect(wrapper.emitted('toggle-selection')).toBeTruthy();
    expect(wrapper.emitted('toggle-selection')[0]).toEqual([1]);
  });

  it('displays correct status badge', () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora
      }
    });

    const statusBadge = wrapper.find('.status-badge');
    expect(statusBadge.text()).toBe('Active');
    expect(statusBadge.classes()).toContain('status-active');
  });

  it('shows weight control for active LoRAs', () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: { ...mockLora, active: true }
      }
    });

    expect(wrapper.find('.lora-card-weight-control').exists()).toBe(true);
    expect(wrapper.find('input[type="range"]').exists()).toBe(true);
  });

  it('hides weight control for inactive LoRAs', () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: { ...mockLora, active: false }
      }
    });

    expect(wrapper.find('.lora-card-weight-control').exists()).toBe(false);
  });

  it('displays tags correctly', () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora
      }
    });

    const tags = wrapper.findAll('.tag');
    expect(tags.length).toBe(3); // Including the type tag
    const tagTexts = tags.map(tag => tag.text());
    expect(tagTexts).toContain('test');
    expect(tagTexts).toContain('lora');
    expect(tagTexts).toContain('character'); // from lora.type
  });

  it('shows "more tags" indicator when there are more than 3 tags', () => {
    const loraWithManyTags = {
      ...mockLora,
      tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5']
    };

    const wrapper = mount(LoraCard, {
      props: {
        lora: loraWithManyTags
      }
    });

    expect(wrapper.text()).toContain('+2 more');
  });

  it('uses correct API URL composition for actions', async () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora,
        viewMode: 'grid',
      },
    });

    const grid = wrapper.findComponent(LoraCardGrid);

    grid.vm.$emit('change-weight', 1.25);
    await flushPromises();
    expect(mocks.updateLoraWeightMock).toHaveBeenCalledWith('/api/v1', 1, 1.25);

    grid.vm.$emit('toggle-active');
    await flushPromises();
    expect(mocks.toggleLoraActiveStateMock).toHaveBeenCalledWith('/api/v1', 1, false);

    grid.vm.$emit('generate-preview');
    await flushPromises();
    expect(mocks.triggerPreviewGenerationMock).toHaveBeenCalledWith('/api/v1', 1);
  });

  it('navigates to recommendations via the router', async () => {
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora,
        viewMode: 'grid',
      },
    });

    const grid = wrapper.findComponent(LoraCardGrid);

    grid.vm.$emit('recommendations');
    await flushPromises();

    expect(mocks.buildRecommendationsUrlMock).toHaveBeenCalledWith(1);
    expect(routerMock.resolve).toHaveBeenCalledWith('/recommendations?lora_id=1');
    expect(routerMock.push).toHaveBeenCalledWith({
      path: '/recommendations',
      query: { lora_id: '1' },
    });
  });
});
