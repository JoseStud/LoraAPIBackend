import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import RecommendationsPanel from '../../app/frontend/static/vue/RecommendationsPanel.vue';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('RecommendationsPanel.vue', () => {
  beforeEach(() => {
    // Simple fetch stub that returns different payloads per URL
    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url || '';
      if (url.includes('/api/v1/adapters')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: [
            { id: '1', name: 'Lora One', description: 'First' },
            { id: '2', name: 'Lora Two', description: 'Second' },
          ] }),
        };
      }
      if (url.includes('/api/v1/recommendations/similar/')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ recommendations: [
            { lora_id: '2', lora_name: 'Rec Two', lora_description: 'Nice', similarity_score: 0.91, final_score: 0.88 },
          ] }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });
  });

  it('loads LoRA options on mount and fetches recommendations when a LoRA is selected', async () => {
    const wrapper = mount(RecommendationsPanel);

    // Wait for initial loras fetch
    await flush();

    const select = wrapper.find('select');
    expect(select.exists()).toBe(true);
    // Should have options including Lora One
    expect(wrapper.text()).toContain('Lora One');

    // Select a LoRA triggers watcher -> fetch recs
    await select.setValue('1');
    await flush();

    // Rendered recommendation
    expect(wrapper.text()).toContain('Rec Two');
    expect(wrapper.text()).toContain('0.910'); // similarity score formatted
  });
});
