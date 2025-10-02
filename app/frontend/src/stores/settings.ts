import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import type { FrontendRuntimeSettings } from '@/types';

import { normalizeBackendConfig } from '@/shared/config/backendConfig';
import {
  backendEnvironmentReadyPromise,
  getBackendEnvironmentSnapshot,
  getRuntimeBackendDefaults,
  publishBackendEnvironment,
  resetBackendEnvironment,
} from '@/services';

const runtimeBackendDefaults = Object.freeze(getRuntimeBackendDefaults());

export const useSettingsStore = defineStore('app-settings', () => {
  const settings = ref<FrontendRuntimeSettings | null>(null);
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const error = ref<unknown>(null);


  const backendUrl = computed<string>(() => {
    if (!settings.value) {
      return runtimeBackendDefaults.backendUrl;
    }

    return (
      normalizeBackendConfig({
        baseURL: settings.value.backendUrl ?? runtimeBackendDefaults.backendUrl,
      }).baseURL || runtimeBackendDefaults.backendUrl
    );
  });

  const backendApiKey = computed<string | null>(() => {
    if (!settings.value) {
      return runtimeBackendDefaults.backendApiKey;
    }

    const hasExplicitKey = Object.prototype.hasOwnProperty.call(settings.value, 'backendApiKey');
    if (!hasExplicitKey) {
      return runtimeBackendDefaults.backendApiKey;
    }

    return normalizeBackendConfig({ apiKey: settings.value.backendApiKey }).apiKey;
  });

  const rawSettings = computed<FrontendRuntimeSettings | null>(() => settings.value);

  const setSettings = (partial: Partial<FrontendRuntimeSettings> = {}) => {
    const previousSettings: Partial<FrontendRuntimeSettings> = settings.value ?? {};

    const hasBackendUrl = Object.prototype.hasOwnProperty.call(partial, 'backendUrl');
    const hasBackendApiKey = Object.prototype.hasOwnProperty.call(partial, 'backendApiKey');

    const previousBackendConfig = normalizeBackendConfig({
      baseURL: previousSettings.backendUrl ?? runtimeBackendDefaults.backendUrl,
      apiKey: Object.prototype.hasOwnProperty.call(previousSettings, 'backendApiKey')
        ? previousSettings.backendApiKey
        : runtimeBackendDefaults.backendApiKey,
    });

    const nextBackendConfig = normalizeBackendConfig({
      baseURL: hasBackendUrl
        ? partial.backendUrl ?? previousBackendConfig.baseURL
        : previousBackendConfig.baseURL,
      apiKey: hasBackendApiKey ? partial.backendApiKey ?? null : previousBackendConfig.apiKey,
    });

    const previousBackendApiKeyExplicit = Object.prototype.hasOwnProperty.call(previousSettings, 'backendApiKey')
      ? true
      : runtimeBackendDefaults.hasExplicitBackendApiKey;
    const nextBackendApiKeyExplicit = hasBackendApiKey ? true : previousBackendApiKeyExplicit;

    const merged: FrontendRuntimeSettings = {
      ...(settings.value ?? {}),
      ...partial,
      backendUrl: nextBackendConfig.baseURL,
      backendApiKey: nextBackendConfig.apiKey,
    };

    settings.value = merged;
    isLoaded.value = true;

    publishBackendEnvironment({
      backendUrl: nextBackendConfig.baseURL,
      backendApiKey: nextBackendConfig.apiKey,
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
      const { loadFrontendSettings } = await import('@/services');
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

    get backendEnvironmentReadyPromise() {
      return backendEnvironmentReadyPromise;
    },

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

