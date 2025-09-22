import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import PromptComposer from '../../app/frontend/src/components/PromptComposer.vue';
import { useAppStore } from '../../app/frontend/src/stores/app';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('PromptComposer.vue', () => {
  beforeEach(() => {
    useAppStore().$reset();
    const jsonResponse = (payload) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    });

    // Simple fetch stub for LoRAs and generate endpoint
    global.fetch = vi.fn(async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || '';
      if (url.includes('/api/v1/adapters')) {
        return jsonResponse({ items: [
          { id: '1', name: 'LoraOne', description: 'First', active: true },
          { id: '2', name: 'LoraTwo', description: 'Second', active: false },
        ] });
      }
      if (url.endsWith('/generate')) {
        return jsonResponse({ ok: true });
      }
      return jsonResponse({});
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
    const generateBtn = wrapper.find('[data-testid="generate-image"]');
    await generateBtn.trigger('click');
    await flush();
    expect(wrapper.find('[data-testid="base-error"]').text()).toContain('Base prompt is required');
  });

  it('adds a LoRA to composition and updates final prompt with weight changes', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    // Click first available lora
    const firstItem = wrapper.find('[data-testid="lora-list"] button');
    await firstItem.trigger('click');
    await nextTick();

    // Set base prompt
    const base = wrapper.find('[data-testid="base-prompt"]');
    await base.setValue('A scenic view');
    await nextTick();

    // Change weight slider
    const slider = wrapper.find('[data-testid="weight-slider"]');
    await slider.setValue('1.5');
    await nextTick();

    const finalPrompt = wrapper.find('[data-testid="final-prompt"]').element.value;
    expect(finalPrompt).toContain('A scenic view');
    expect(finalPrompt).toContain('<lora:LoraOne:1.5>');
  });

  it('formats weight tokens without trailing dots', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    await wrapper.find('[data-testid="lora-list"] button').trigger('click');
    await nextTick();

    const base = wrapper.find('[data-testid="base-prompt"]');
    await base.setValue('A base prompt');
    await nextTick();

    let finalPrompt = wrapper.find('[data-testid="final-prompt"]').element.value;
    expect(finalPrompt).toContain('<lora:LoraOne:1.0>');

    const slider = wrapper.find('[data-testid="weight-slider"]');
    await slider.setValue('0');
    await nextTick();

    finalPrompt = wrapper.find('[data-testid="final-prompt"]').element.value;
    expect(finalPrompt).toContain('<lora:LoraOne:0.0>');
  });

  it('keeps negative prompt separate from the final prompt text', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    const base = wrapper.find('[data-testid="base-prompt"]');
    await base.setValue('Base prompt');
    await nextTick();

    const negative = wrapper.find('[data-testid="negative-prompt"]');
    await negative.setValue('blurry, low quality');
    await nextTick();

    const finalPrompt = wrapper.find('[data-testid="final-prompt"]').element.value;
    expect(finalPrompt).toBe('Base prompt');
  });

  it('removes LoRA from composition', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    const firstItem = wrapper.find('[data-testid="lora-list"] button');
    await firstItem.trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="composition"]').text()).not.toContain('No LoRAs in composition');

    const removeBtn = wrapper.find('[data-testid="remove-entry"]');
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
    await wrapper.find('[data-testid="lora-list"] button').trigger('click');
    await wrapper.find('[data-testid="base-prompt"]').setValue('Base');
    await nextTick();

    // Save
    const saveBtn = wrapper.find('[data-testid="save-composition"]');
    await saveBtn.trigger('click');

    // Clear composition by removing item
    await wrapper.find('[data-testid="remove-entry"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="composition"]').text()).toContain('No LoRAs');

    // Ensure storage contains composition
    localStorage.setItem('prompt-composer-composition', JSON.stringify({
      items: [{ id: '1', name: 'LoraOne', weight: 1 }],
      base: 'Base',
      neg: ''
    }));

    const loadBtn = wrapper.findAll('button').find((btn) => btn.text() === 'Load Composition');
    expect(loadBtn).toBeDefined();
    await loadBtn.trigger('click');
    await flush();
    expect(wrapper.find('[data-testid="composition"]').text()).not.toContain('No LoRAs');
  });

  it('generates when base prompt is valid', async () => {
    const wrapper = mount(PromptComposer);
    await flush();

    await wrapper.find('[data-testid="base-prompt"]').setValue('Hello');
    await nextTick();
    const generateBtn = wrapper.find('[data-testid="generate-image"]');
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
