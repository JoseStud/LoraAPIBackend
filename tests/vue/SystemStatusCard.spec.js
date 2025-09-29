import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

import SystemStatusCard from '../../app/frontend/src/components/system/SystemStatusCard.vue';
import { useGenerationConnectionStore } from '../../app/frontend/src/stores/generation';

const mockController = {
  ensureHydrated: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
  stop: vi.fn(),
  isPolling: { value: false },
};

vi.mock('../../app/frontend/src/stores/generation/systemStatusController', () => ({
  useSystemStatusController: () => mockController,
  acquireSystemStatusController: () => ({
    controller: mockController,
    release: vi.fn(),
  }),
}));

const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

describe('SystemStatusCard.vue', () => {
  beforeEach(() => {
    const store = useGenerationConnectionStore();
    store.reset();
    mockController.ensureHydrated.mockClear();
    mockController.refresh.mockClear();
    mockController.start.mockClear();
    mockController.stop.mockClear();
    mockController.isPolling.value = false;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders system status using shared store data (simple variant)', async () => {
    const store = useGenerationConnectionStore();
    store.updateSystemStatus({
      gpu_status: 'Available',
      queue_length: 3,
      memory_used: 4096,
      memory_total: 8192,
      status: 'healthy',
    });
    store.markSystemStatusHydrated(new Date('2024-01-01T00:00:00Z'));

    const wrapper = mount(SystemStatusCard);
    await flush();

    expect(wrapper.text()).toContain('GPU Status');
    expect(wrapper.text()).toContain('Available');
    expect(wrapper.text()).toContain('3');
    expect(wrapper.text()).toContain('4.0GB / 8.0GB (50%)');
    expect(wrapper.text()).toContain('healthy');

    wrapper.unmount();
  });

  it('shows fallback messaging when real-time status is unavailable (detailed variant)', async () => {
    const store = useGenerationConnectionStore();
    store.resetSystemStatus();
    store.markSystemStatusUnavailable(new Date('2024-01-01T00:00:00Z'));

    const wrapper = mount(SystemStatusCard, { props: { variant: 'detailed' } });
    await flush();

    await wrapper.find('.card-header').trigger('click');
    await flush();

    expect(wrapper.text()).toContain('Real-time status is unavailable; showing default values.');
    expect(wrapper.text()).toContain('Last update:');
    expect(wrapper.text()).toContain('0 jobs');
    expect(wrapper.text()).toContain('Unknown');

    wrapper.unmount();
  });
});
