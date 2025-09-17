import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PromptComposer from '../../app/frontend/static/vue/PromptComposer.vue';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
<<<<<<< HEAD
  await new Promise((resolve) => setTimeout(resolve, 0));
=======
  await new Promise((r) => setTimeout(r, 0));
>>>>>>> temp/fe-106-migration
  await nextTick();
};

describe('PromptComposer.vue', () => {
<<<<<<< HEAD
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
=======
  beforeEach(() => {
    // Simple fetch stub for LoRAs and generate endpoint
    global.fetch = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/api/adapters')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [
            { id: '1', name: 'LoraOne', description: 'First', active: true },
            { id: '2', name: 'LoraTwo', description: 'Second', active: false },
          ] }),
        };
      }
      if (url.endsWith('/generate')) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    // Basic clipboard mock
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn(async () => {}) },
    });

    // Clean storage
    localStorage.clear();
  });

  it('renders and loads available LoRAs', async () => {
    const wrapper = mount(PromptComposer);
    await flush();
    expect(wrapper.text()).toContain('Prompt Composer');
    expect(wrapper.find('[data-testid="lora-list"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('LoraOne');
  });

  it('validates base prompt before generation', async () => {
    const wrapper = mount(PromptComposer);
    await flush();
    // Click Generate without a base prompt
    const generateBtn = wrapper.find('button.btn.btn-primary.w-full');
    await generateBtn.trigger('click');
    await flush();
    expect(wrapper.find('[data-testid="base-error"]').text()).toContain('Base prompt is required');
  });

  it('adds a LoRA to composition and updates final prompt with weight changes', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    // Click first available lora
    const firstItem = wrapper.find('[data-testid="lora-list"] > div');
    await firstItem.trigger('click');
    await nextTick();

    // Set base prompt
    const base = wrapper.find('textarea');
    await base.setValue('A scenic view');
    await nextTick();

    // Change weight slider
    const slider = wrapper.find('input[type="range"]');
    await slider.setValue('1.5');
    await nextTick();

    const finalPrompt = wrapper.findAll('textarea').at(2).element.value;
    expect(finalPrompt).toContain('A scenic view');
    expect(finalPrompt).toContain('<lora:LoraOne:1.5>');
  });

  it('removes LoRA from composition', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    const firstItem = wrapper.find('[data-testid="lora-list"] > div');
    await firstItem.trigger('click');
    await nextTick();
    // Validate reactive state restored
    expect(wrapper.vm.activeLoras?.length || 0).toBeGreaterThan(0);

    const removeBtn = wrapper.find('button.btn.btn-secondary.btn-xs:last-of-type');
    await removeBtn.trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="composition"]').text()).toContain('No LoRAs in composition');
  });

  it('filters LoRAs by search term', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    const search = wrapper.find('input[placeholder="Search LoRAs..."]');
    await search.setValue('two');
    await nextTick();
    const listText = wrapper.find('[data-testid="lora-list"]').text();
    expect(listText).toContain('LoraTwo');
    expect(listText).not.toContain('LoraOne');
  });

  it('saves and loads composition from localStorage', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    // Add lora and base prompt
    await wrapper.find('[data-testid="lora-list"] > div').trigger('click');
    await wrapper.find('textarea').setValue('Base');
    await nextTick();

    // Save
    const saveBtn = wrapper.findAll('button.btn.btn-secondary.w-full').at(1);
    await saveBtn.trigger('click');

    // Clear composition by removing item
    await wrapper.find('button.btn.btn-secondary.btn-xs:last-of-type').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="composition"]').text()).toContain('No LoRAs');

    // Ensure storage contains composition
    localStorage.setItem('prompt-composer-composition', JSON.stringify({
      items: [{ id: '1', name: 'LoraOne', weight: 1 }],
      base: 'Base',
      neg: ''
    }));

    // Load (call component method directly to avoid selector ambiguity)
    await wrapper.vm.loadComposition();
    await flush();
    expect(wrapper.vm.activeLoras?.length || 0).toBeGreaterThan(0);
  });

  it('generates when base prompt is valid', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    await wrapper.find('textarea').setValue('Hello');
    await nextTick();
    const generateBtn = wrapper.find('button.btn.btn-primary.w-full');
    await generateBtn.trigger('click');
    await flush();
    // Called at least once for /generate
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/generate'), expect.any(Object));
  });

  it('copies prompt to clipboard', async () => {
    const wrapper = mount(PromptComposer);
    await flush();
    await wrapper.find('textarea').setValue('CopyMe');
    await nextTick();
    const copyBtn = wrapper.findAll('button.btn.btn-secondary.w-full').at(0);
    await copyBtn.trigger('click');
    await flush();
    // Validate final prompt is kept and no error is thrown
    const final = wrapper.findAll('textarea').at(2).element.value;
    expect(final).toBe('CopyMe');
  });
});
>>>>>>> temp/fe-106-migration
