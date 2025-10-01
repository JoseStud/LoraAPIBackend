import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { useBackendRefresh } from '@/services/system/backendRefresh';
import { useSettingsStore } from '@/stores/settings';

const flushBackendWatchers = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

describe('useBackendRefresh', () => {
  let settingsStore: ReturnType<typeof useSettingsStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    settingsStore = useSettingsStore();
    settingsStore.reset();
  });

  afterEach(() => {
    settingsStore.$dispose();
  });

  it('invokes the refresh callback when the backend url changes', async () => {
    const refresh = vi.fn();
    const subscription = useBackendRefresh(refresh);

    settingsStore.setSettings({ backendUrl: 'https://api.example/v1' });
    await flushBackendWatchers();

    expect(refresh).toHaveBeenCalledTimes(1);

    subscription.stop();
  });

  it('stops invoking the callback after stop is called', async () => {
    const refresh = vi.fn();
    const subscription = useBackendRefresh(refresh);

    settingsStore.setSettings({ backendUrl: 'https://api.example/v1' });
    await flushBackendWatchers();

    expect(refresh).toHaveBeenCalledTimes(1);

    subscription.stop();
    settingsStore.setSettings({ backendUrl: 'https://api.example/v2' });
    await flushBackendWatchers();

    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
