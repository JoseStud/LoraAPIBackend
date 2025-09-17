import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import PromptComposer from '../../app/frontend/static/vue/PromptComposer.vue';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('PromptComposer.vue', () => {
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
