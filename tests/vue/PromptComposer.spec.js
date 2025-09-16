import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PromptComposer from '../../app/frontend/static/vue/PromptComposer.vue';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

describe('PromptComposer.vue', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the component and loads initial state', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([
        {
          id: 1,
          name: 'test-lora',
          description: 'Test LoRA description',
          active: true,
          tags: ['test', 'example']
        }
      ]),
    }));

    const wrapper = mount(PromptComposer);
    await flush();

    expect(wrapper.text()).toContain('Prompt Composer');
    expect(wrapper.text()).toContain('Available LoRAs');
    expect(wrapper.text()).toContain('Active Composition');
    expect(wrapper.text()).toContain('Generated Prompt');

    wrapper.unmount();
  });

  it('validates base prompt correctly', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([]),
    }));

    const wrapper = mount(PromptComposer);
    await flush();

    // Test empty prompt validation
    const basePromptTextarea = wrapper.find('textarea[placeholder*="base prompt"]');
    await basePromptTextarea.setValue('');
    await basePromptTextarea.trigger('input');
    await flush();

    expect(wrapper.text()).toContain('Base prompt is required');

    // Test overly long prompt validation
    const longPrompt = 'a'.repeat(1001);
    await basePromptTextarea.setValue(longPrompt);
    await basePromptTextarea.trigger('input');
    await flush();

    expect(wrapper.text()).toContain('Prompt is too long');

    // Test valid prompt
    await basePromptTextarea.setValue('a beautiful anime girl');
    await basePromptTextarea.trigger('input');
    await flush();

    expect(wrapper.text()).not.toContain('Base prompt is required');
    expect(wrapper.text()).not.toContain('Prompt is too long');

    wrapper.unmount();
  });

  it('adds and removes LoRAs from composition', async () => {
    const mockLoras = [
      {
        id: 1,
        name: 'test-lora-1',
        description: 'Test LoRA 1',
        active: true,
        tags: ['test']
      },
      {
        id: 2,
        name: 'test-lora-2',
        description: 'Test LoRA 2',
        active: false,
        tags: ['example']
      }
    ];

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockLoras,
    }));

    const wrapper = mount(PromptComposer);
    await flush();

    // Should show available LoRAs
    expect(wrapper.text()).toContain('test-lora-1');
    expect(wrapper.text()).toContain('test-lora-2');

    // Add first LoRA to composition
    const loraItems = wrapper.findAll('.cursor-pointer');
    await loraItems[0].trigger('click');
    await flush();

    // Check that LoRA was added to composition
    expect(wrapper.text()).toContain('1 LoRAs');
    
    // Check that the final prompt contains the LoRA
    const finalPrompt = wrapper.find('textarea[readonly]');
    expect(finalPrompt.element.value).toContain('<lora:test-lora-1>');

    wrapper.unmount();
  });

  it('updates prompt when base prompt and LoRAs change', async () => {
    const mockLoras = [
      {
        id: 1,
        name: 'style-lora',
        description: 'Style LoRA',
        active: true,
        tags: ['style']
      }
    ];

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockLoras,
    }));

    const wrapper = mount(PromptComposer);
    await flush();

    // Set base prompt
    const basePromptTextarea = wrapper.find('textarea[placeholder*="base prompt"]');
    await basePromptTextarea.setValue('a beautiful anime girl');
    await basePromptTextarea.trigger('input');
    await flush();

    // Add LoRA to composition
    const loraItems = wrapper.findAll('.cursor-pointer');
    await loraItems[0].trigger('click');
    await flush();

    // Check final prompt combines base prompt and LoRA
    const finalPrompt = wrapper.find('textarea[readonly]');
    expect(finalPrompt.element.value).toContain('a beautiful anime girl, <lora:style-lora>');

    wrapper.unmount();
  });

  it('handles weight management correctly', async () => {
    const mockLoras = [
      {
        id: 1,
        name: 'lora-1',
        description: 'LoRA 1',
        active: true,
        tags: []
      },
      {
        id: 2,
        name: 'lora-2',
        description: 'LoRA 2',
        active: true,
        tags: []
      }
    ];

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockLoras,
    }));

    const wrapper = mount(PromptComposer);
    await flush();

    // Add both LoRAs to composition
    const loraItems = wrapper.findAll('.cursor-pointer');
    await loraItems[0].trigger('click');
    await loraItems[1].trigger('click');
    await flush();

    // Check total weight (should be 2.00)
    expect(wrapper.text()).toContain('2.00');

    // Test balance weights - find button by text content
    const buttons = wrapper.findAll('button');
    const balanceButton = buttons.find(button => button.text().includes('Auto-balance'));
    expect(balanceButton).toBeTruthy();
    await balanceButton.trigger('click');
    await flush();

    // After balancing, weights should be equal (0.50 each, total 1.00)
    expect(wrapper.text()).toContain('1.00');

    wrapper.unmount();
  });

  it('filters LoRAs based on search term', async () => {
    const mockLoras = [
      {
        id: 1,
        name: 'anime-style',
        description: 'Anime style LoRA',
        active: true,
        tags: ['anime']
      },
      {
        id: 2,
        name: 'realistic-photo',
        description: 'Realistic photography LoRA',
        active: true,
        tags: ['photo']
      }
    ];

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => mockLoras,
    }));

    const wrapper = mount(PromptComposer);
    await flush();

    // Initially both LoRAs should be visible
    expect(wrapper.text()).toContain('anime-style');
    expect(wrapper.text()).toContain('realistic-photo');

    // Search for 'anime'
    const searchInput = wrapper.find('input[placeholder*="Search LoRAs"]');
    await searchInput.setValue('anime');
    await searchInput.trigger('input');
    await flush();

    // Wait for debounced search
    await new Promise(resolve => setTimeout(resolve, 350));
    await flush();

    // Only anime-style should be visible
    expect(wrapper.text()).toContain('anime-style');
    expect(wrapper.text()).not.toContain('realistic-photo');

    wrapper.unmount();
  });

  it('handles API errors gracefully', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    }));

    const wrapper = mount(PromptComposer);
    await flush();

    // Should show error message in toast
    expect(wrapper.text()).toContain('Failed to load LoRAs');

    wrapper.unmount();
  });

  it('validates submission before generating image', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([]),
    }));

    const wrapper = mount(PromptComposer);
    await flush();

    // Try to find generate button by text content
    const buttons = wrapper.findAll('button');
    const generateButton = buttons.find(button => button.text().includes('Generate Image'));
    expect(generateButton).toBeTruthy();
    expect(generateButton.attributes('disabled')).toBeDefined();

    // Add valid base prompt
    const basePromptTextarea = wrapper.find('textarea[placeholder*="base prompt"]');
    await basePromptTextarea.setValue('a beautiful anime girl');
    await basePromptTextarea.trigger('input');
    await flush();

    // Now generate button should be enabled
    expect(generateButton.attributes('disabled')).toBeUndefined();

    wrapper.unmount();
  });

  it('copies prompt to clipboard', async () => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ([]),
    }));

    const wrapper = mount(PromptComposer);
    await flush();

    // Set base prompt
    const basePromptTextarea = wrapper.find('textarea[placeholder*="base prompt"]');
    await basePromptTextarea.setValue('test prompt');
    await basePromptTextarea.trigger('input');
    await flush();

    // Click copy button by finding it by text content
    const buttons = wrapper.findAll('button');
    const copyButton = buttons.find(button => button.text().includes('Copy Prompt'));
    expect(copyButton).toBeTruthy();
    await copyButton.trigger('click');
    await flush();

    // Check that clipboard was called
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('test prompt');

    wrapper.unmount();
  });
});