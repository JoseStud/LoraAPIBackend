import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import type { FrontendRuntimeSettings } from '@/types';

import { sanitizeBackendBaseUrl } from '@/utils/backend/helpers';
import {
  backendEnvironmentReadyPromise,
  getBackendEnvironmentSnapshot,
  getRuntimeBackendDefaults,
  normaliseBackendApiKey,
  publishBackendEnvironment,
  resetBackendEnvironment,
} from '@/services/backendEnvironment';

const runtimeBackendDefaults = Object.freeze(getRuntimeBackendDefaults());

const ensureBackendUrl = (value: unknown): string => {
  if (typeof value === 'string') {
    return sanitizeBackendBaseUrl(value);
  }
  if (value == null) {
    return runtimeBackendDefaults.backendUrl;
  }
  return sanitizeBackendBaseUrl(String(value));
};

const ensureBackendApiKey = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  return normaliseBackendApiKey(value as string | null | undefined);
};

export const useSettingsStore = defineStore('app-settings', () => {
  const settings = ref<FrontendRuntimeSettings | null>(null);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<unknown>(null);

  const backendUrl = computed<string>(() => {
    if (!settings.value) {
      return runtimeBackendDefaults.backendUrl;
    }

    const candidate = ensureBackendUrl(settings.value.backendUrl ?? runtimeBackendDefaults.backendUrl);
    return candidate || runtimeBackendDefaults.backendUrl;
  });

  const backendApiKey = computed<string | null>(() => {
    if (!settings.value) {
      return runtimeBackendDefaults.backendApiKey ?? null;
    }

    const hasExplicitKey = Object.prototype.hasOwnProperty.call(settings.value, 'backendApiKey');
    if (!hasExplicitKey) {
      return runtimeBackendDefaults.backendApiKey ?? null;
    }

    return normaliseBackendApiKey(settings.value.backendApiKey ?? null);
  });

  const rawSettings = computed<FrontendRuntimeSettings | null>(() => settings.value);

  const setSettings = (partial: Partial<FrontendRuntimeSettings> = {}) => {
    const previousSettings: Partial<FrontendRuntimeSettings> = settings.value ?? {};

    const hasBackendUrl = Object.prototype.hasOwnProperty.call(partial, 'backendUrl');
    const backendUrlSource = hasBackendUrl
      ? partial.backendUrl
      : previousSettings.backendUrl ?? runtimeBackendDefaults.backendUrl;
    const nextBackendUrl = ensureBackendUrl(backendUrlSource);

    const hasBackendApiKey = Object.prototype.hasOwnProperty.call(partial, 'backendApiKey');
    const previousBackendApiKey = Object.prototype.hasOwnProperty.call(previousSettings, 'backendApiKey')
      ? ensureBackendApiKey(previousSettings.backendApiKey)
      : runtimeBackendDefaults.backendApiKey ?? null;
    const previousBackendApiKeyExplicit = Object.prototype.hasOwnProperty.call(previousSettings, 'backendApiKey')
      ? true
      : runtimeBackendDefaults.hasExplicitBackendApiKey;
    const nextBackendApiKey = hasBackendApiKey ? ensureBackendApiKey(partial.backendApiKey) : previousBackendApiKey;
    const nextBackendApiKeyExplicit = hasBackendApiKey ? true : previousBackendApiKeyExplicit;

    const merged: FrontendRuntimeSettings = {
      ...(settings.value ?? {}),
      ...partial,
      backendUrl: nextBackendUrl,
      backendApiKey: nextBackendApiKey,
    };

    settings.value = merged;
    isLoaded.value = true;
    publishBackendEnvironment({
      backendUrl: nextBackendUrl,
      backendApiKey: nextBackendApiKey,
      hasExplicitBackendApiKey: nextBackendApiKeyExplicit,
    });
  };

  const loadSettings = async (force = false) => {
    if (isLoaded.value && !force) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const { loadFrontendSettings } = await import('@/services/system/systemService');
      const payload = await loadFrontendSettings();
      if (!payload) {
        throw new Error('Received empty settings response');
      }
      setSettings(payload);
    } catch (err) {
      error.value = err;
      if (!isLoaded.value) {
        setSettings({ backendUrl: runtimeBackendDefaults.backendUrl });
      }
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  const reset = () => {
    settings.value = null;
    isLoaded.value = false;
    isLoading.value = false;
    error.value = null;
    resetBackendEnvironment();
  };

  return {
    settings,
    isLoading,
    isLoaded,
    error,
    backendUrl,
    backendApiKey,
    rawSettings,
    setSettings,
    loadSettings,
    reset,
    backendEnvironmentReadyPromise: backendEnvironmentReadyPromise,
  };
});

export type SettingsStore = ReturnType<typeof useSettingsStore>;

export const tryGetSettingsStore = (): SettingsStore | null => {
  try {
    return useSettingsStore();
  } catch (_error) {
    return null;
  }
};

export const getResolvedBackendSettings = (): {
  backendUrl: string;
  backendApiKey: string | null;
  hasExplicitBackendApiKey: boolean;
} => {
  return getBackendEnvironmentSnapshot();
};

export const getResolvedBackendUrl = (): string => getResolvedBackendSettings().backendUrl;

export const getResolvedBackendApiKey = (): string | null => getResolvedBackendSettings().backendApiKey;
