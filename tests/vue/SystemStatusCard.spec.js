import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import SystemStatusCard from '../../app/frontend/src/components/system/SystemStatusCard.vue';
import { useGenerationConnectionStore } from '../../app/frontend/src/stores/generation';

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
};

describe('SystemStatusCard.vue', () => {
  beforeEach(() => {
    useGenerationConnectionStore().reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders system status from the API for the simple variant', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        gpu_status: 'Available',
        queue_length: 3,
        memory_used: 4096,
        memory_total: 8192,
        status: 'healthy',
      }),
    }));

    const wrapper = mount(SystemStatusCard);
    await flush();

    expect(wrapper.text()).toContain('GPU Status');
    expect(wrapper.text()).toContain('Available');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('4.0GB / 8.0GB (50%)');
    expect(wrapper.text()).toContain('healthy');

    wrapper.unmount();
  });

  it('shows fallback messaging when the API is unavailable (detailed variant)', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 404 }));

    const wrapper = mount(SystemStatusCard, { props: { variant: 'detailed' } });
    await flush();

    // Expand the detailed view
    await wrapper.find('.card-header').trigger('click');
    await flush();

    expect(wrapper.text()).toContain('Real-time status is unavailable; showing default values.');
    expect(wrapper.text()).toContain('Last update:');
    expect(wrapper.text()).toContain('0 jobs');
    expect(wrapper.text()).toContain('Unknown');

    wrapper.unmount();
  });
});
