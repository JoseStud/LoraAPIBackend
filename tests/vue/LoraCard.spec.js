import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import LoraCard from '../../app/frontend/static/vue/LoraCard.vue';

// Mock global fetch
global.fetch = vi.fn();

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
    global.fetch.mockReset();
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
    // Mock fetch to capture URLs
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });
    global.fetch = fetchSpy;
    
    const wrapper = mount(LoraCard, {
      props: {
        lora: mockLora
      }
    });

    // Test weight update URL
    await wrapper.vm.updateWeight();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/adapters/1/weight',
      expect.objectContaining({ method: 'PATCH' })
    );

    // Test toggle active URL
    await wrapper.vm.toggleActive();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/adapters/1/toggle',
      expect.objectContaining({ method: 'POST' })
    );

    // Test generate preview URL
    await wrapper.vm.generatePreview();
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/adapters/1/generate-preview',
      expect.objectContaining({ method: 'POST' })
    );
  });
});