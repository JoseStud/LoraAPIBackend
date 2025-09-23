import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
import { mount } from '@vue/test-utils';

import { useJobQueuePolling } from '@/composables/generation/useJobQueuePolling';

describe('useJobQueuePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes the fetch callback on an interval and stops when disabled', async () => {
    const disabled = ref(false);
    const pollInterval = ref(100);
    const fetchJobs = vi.fn().mockResolvedValue([{ id: 'job-1' }, { id: 'job-2' }]);
    const onRecord = vi.fn();

    let polling: ReturnType<typeof useJobQueuePolling> | undefined;

    const wrapper = mount({
      setup() {
        polling = useJobQueuePolling({
          disabled: computed(() => disabled.value),
          pollInterval: computed(() => pollInterval.value),
          fetchJobs,
          onRecord,
        });
        return () => null;
      },
    });

    await polling!.refresh();
    await Promise.resolve();

    expect(fetchJobs).toHaveBeenCalledTimes(1);

    polling!.startPolling();

    await vi.advanceTimersByTimeAsync(100);
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchJobs).toHaveBeenCalledTimes(2);

    disabled.value = true;
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(200);

    expect(fetchJobs).toHaveBeenCalledTimes(2);

    wrapper.unmount();
  });
});
