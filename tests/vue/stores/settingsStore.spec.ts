import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, watch } from 'vue';
import { createPinia, setActivePinia } from 'pinia';

import { useSettingsStore } from '@/stores';
import { useBackendEnvironment } from '@/services/backendEnvironment';

const flushBackendWatchers = async () => {
  await nextTick();
  await Promise.resolve();
  await nextTick();
};

describe('backend environment binding', () => {
  let settingsStore: ReturnType<typeof useSettingsStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    settingsStore = useSettingsStore();
    settingsStore.reset();
  });

  afterEach(() => {
    settingsStore.$dispose();
  });

  it('exposes backend url changes through reactive state', async () => {
    const binding = useBackendEnvironment();
    await binding.readyPromise;

    const initialUrl = binding.backendUrl.value;
    const firstUrl = 'https://api.example.com/v1';

    settingsStore.setSettings({ backendUrl: firstUrl });
    await flushBackendWatchers();

    expect(binding.backendUrl.value).toBe(firstUrl);

    settingsStore.setSettings({ backendUrl: firstUrl });
    await flushBackendWatchers();

    expect(binding.backendUrl.value).toBe(firstUrl);

    const secondUrl = 'https://api.example.com/v2';
    settingsStore.setSettings({ backendUrl: secondUrl });
    await flushBackendWatchers();

    expect(binding.backendUrl.value).toBe(secondUrl);
    expect(binding.backendUrl.value).not.toBe(initialUrl);
  });

  it('allows consumers to watch backend changes within their own scope', async () => {
    const binding = useBackendEnvironment();
    await binding.readyPromise;

    const initialUrl = binding.backendUrl.value;
    const firstUrl = 'https://notify.example/v1';
    const secondUrl = 'https://notify.example/v2';

    const handler = vi.fn();
    const scope = effectScope();

    scope.run(() => {
      watch(binding.backendUrl, (next, previous) => {
        handler(next, previous);
      });
    });

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

    scope.stop();

    settingsStore.setSettings({ backendUrl: 'https://notify.example/v3' });
    await flushBackendWatchers();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('rejects stale ready promises and resolves the latest environment after settings updates', async () => {
    const binding = useBackendEnvironment();
    await binding.readyPromise;

    settingsStore.setSettings({ backendUrl: 'https://epoch-one.example/v1' });
    const firstEpochPromise = binding.readyPromise;

    settingsStore.setSettings({ backendUrl: 'https://epoch-two.example/v2' });

    await expect(firstEpochPromise).rejects.toThrow(
      'Backend environment readiness promise superseded by a newer update',
    );

    await binding.readyPromise;
    await flushBackendWatchers();

    expect(binding.backendUrl.value).toBe('https://epoch-two.example/v2');

    settingsStore.setSettings({ backendUrl: 'https://epoch-three.example/v3' });
    await binding.readyPromise;
    await flushBackendWatchers();

    expect(binding.backendUrl.value).toBe('https://epoch-three.example/v3');
  });
});
