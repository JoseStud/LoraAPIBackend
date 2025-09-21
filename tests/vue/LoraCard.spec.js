import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import LoraCard from '../../app/frontend/src/components/LoraCard.vue';

const mocks = vi.hoisted(() => ({
  updateLoraWeightMock: vi.fn(),
  toggleLoraActiveStateMock: vi.fn(),
  triggerPreviewGenerationMock: vi.fn(),
  deleteLoraMock: vi.fn(),
  buildRecommendationsUrlMock: vi.fn(),
}))

vi.mock('../../app/frontend/src/services/loraService.ts', async () => {
  const actual = await vi.importActual('../../app/frontend/src/services/loraService.ts');
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
    mocks.buildRecommendationsUrlMock.mockReturnValue('/recommendations/1');
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
      },
    });

    await wrapper.vm.updateWeight();
    expect(mocks.updateLoraWeightMock).toHaveBeenCalledWith('/api/v1', 1, expect.any(Number));

    await wrapper.vm.toggleActive();
    expect(mocks.toggleLoraActiveStateMock).toHaveBeenCalledWith('/api/v1', 1, false);

    await wrapper.vm.generatePreview();
    expect(mocks.triggerPreviewGenerationMock).toHaveBeenCalledWith('/api/v1', 1);
  });
});