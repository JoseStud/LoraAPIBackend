import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, onScopeDispose } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import { useBackendEnvironment, useSettingsStore } from '@/stores';
import { resetBackendEnvironmentBus } from '@/services/system/backendEnvironmentEventBus';

const flushBackendWatchers = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

describe('backend environment notifier', () => {
  let settingsStore: ReturnType<typeof useSettingsStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    settingsStore = useSettingsStore();
    settingsStore.reset();
  });

  afterEach(() => {
    resetBackendEnvironmentBus();
    settingsStore.$dispose();
  });

  it('notifies subscribers once per backend url change', async () => {
    const { onBackendUrlChange, readyPromise } = useBackendEnvironment();
    await readyPromise;

    const initialUrl = settingsStore.backendUrl;
    const firstUrl = 'https://api.example.com/v1';
    const secondUrl = 'https://api.example.com/v2';

    const handler = vi.fn();
    const stop = onBackendUrlChange(handler);

    await flushBackendWatchers();
    expect(handler).not.toHaveBeenCalled();

    settingsStore.setSettings({ backendUrl: firstUrl });
    await flushBackendWatchers();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(firstUrl, initialUrl);

    settingsStore.setSettings({ backendUrl: firstUrl });
    await flushBackendWatchers();

    expect(handler).toHaveBeenCalledTimes(1);

    settingsStore.setSettings({ backendUrl: secondUrl });
    await flushBackendWatchers();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenLastCalledWith(secondUrl, firstUrl);

    stop();
  });

  it('stops notifying once subscribers detach', async () => {
    const { onBackendUrlChange, readyPromise } = useBackendEnvironment();
    await readyPromise;

    const handler = vi.fn();
    const stop = onBackendUrlChange(handler);

    settingsStore.setSettings({ backendUrl: 'https://notify.example/api' });
    await flushBackendWatchers();

    expect(handler).toHaveBeenCalledTimes(1);

    stop();

    settingsStore.setSettings({ backendUrl: 'https://notify.example/api/v2' });
    await flushBackendWatchers();

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('restores backend change notifications after subscriber scope disposal', async () => {
    const initialUrl = settingsStore.backendUrl;
    const scope = effectScope();

    scope.run(() => {
      const { onBackendUrlChange } = useBackendEnvironment();
      const stop = onBackendUrlChange(() => {});
      onScopeDispose(stop);
    });

    scope.stop();

    const { onBackendUrlChange, readyPromise } = useBackendEnvironment();
    await readyPromise;

    const handler = vi.fn();
    const stop = onBackendUrlChange(handler);

    const nextUrl = 'https://scope-rebind.example/api';
    settingsStore.setSettings({ backendUrl: nextUrl });
    await flushBackendWatchers();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(nextUrl, initialUrl);

    stop();
  });
});
