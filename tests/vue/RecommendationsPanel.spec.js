import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

vi.mock('../../app/frontend/src/config/runtime.ts', () => {
  const config = {
    mode: 'test',
    isDev: false,
    isProd: false,
    isTest: true,
    backendBasePath: '/api/v1',
    backendApiKey: null,
  };

  return {
    runtimeConfig: config,
    DEFAULT_BACKEND_BASE: '/api/v1',
    default: config,
  };
});

import RecommendationsPanel from '../../app/frontend/src/components/recommendations/RecommendationsPanel.vue';
import { useAppStore } from '../../app/frontend/src/stores/app';
import { useAdapterCatalogStore } from '../../app/frontend/src/stores/adapterCatalog';
import { useSettingsStore } from '../../app/frontend/src/stores/settings';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
};

describe('RecommendationsPanel.vue', () => {
  beforeEach(() => {
    useAppStore().$reset();
    useAdapterCatalogStore().reset();
    useSettingsStore().reset();
    const jsonResponse = (payload) => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    });
    // Simple fetch stub that returns different payloads per URL
    const extractUrl = (input) => (typeof input === 'string' ? input : input?.url || '');
    global.fetch = vi.fn(async (input) => {
      const url = extractUrl(input);
      if (url.includes('/adapters')) {
        return jsonResponse({ items: [
          { id: '1', name: 'Lora One', description: 'First' },
          { id: '2', name: 'Lora Two', description: 'Second' },
        ] });
      }
      if (url.includes('/recommendations/similar/')) {
        return jsonResponse({ recommendations: [
          { lora_id: '2', lora_name: 'Rec Two', lora_description: 'Nice', similarity_score: 0.91, final_score: 0.88 },
        ] });
      }
      return jsonResponse({});
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

    const calledUrls = global.fetch.mock.calls
      .map(([request]) => (typeof request === 'string' ? request : request?.url || ''));
    expect(calledUrls.some((url) => url.includes('/api/v1/recommendations/similar/1'))).toBe(true);
  });

  it('respects backend URL overrides when fetching recommendations', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.setSettings({ backendUrl: 'https://override.test/api/custom' });

    const wrapper = mount(RecommendationsPanel);

    await flush();

    const select = wrapper.find('select');
    await select.setValue('1');
    await flush();

    const calledUrls = global.fetch.mock.calls
      .map(([request]) => (typeof request === 'string' ? request : request?.url || ''));
    const recommendationCall = calledUrls.find((url) => url.includes('/recommendations/similar/1'));
    expect(recommendationCall).toContain('https://override.test/api/custom/recommendations/similar/1');
  });
});
