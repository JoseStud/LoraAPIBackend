import { defineStore } from 'pinia';

import { runtimeConfig } from '@/config/runtime';
import { loadFrontendSettings } from '@/services';
import type { FrontendRuntimeSettings, SettingsState } from '@/types';

import { sanitizeBackendBaseUrl } from '@/utils/backend/helpers';

export const normaliseBackendApiKey = (value?: string | null): string | null => {
  if (value == null) {
    return null;
  }

  const trimmed = `${value}`.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const runtimeBackendDefaults = Object.freeze({
  backendUrl: sanitizeBackendBaseUrl(runtimeConfig.backendBasePath),
  backendApiKey: normaliseBackendApiKey(runtimeConfig.backendApiKey),
});

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

export const useSettingsStore = defineStore('app-settings', {
  state: (): SettingsState => ({
    settings: null,
    isLoading: false,
    isLoaded: false,
    error: null,
  }),

  getters: {
    backendUrl: (state): string => {
      if (!state.settings) {
        return runtimeBackendDefaults.backendUrl;
      }

      const candidate = ensureBackendUrl(state.settings.backendUrl ?? runtimeBackendDefaults.backendUrl);
      return candidate || runtimeBackendDefaults.backendUrl;
    },
    backendApiKey: (state): string | null => {
      if (!state.settings) {
        return runtimeBackendDefaults.backendApiKey ?? null;
      }

      const hasExplicitKey = Object.prototype.hasOwnProperty.call(state.settings, 'backendApiKey');
      if (!hasExplicitKey) {
        return runtimeBackendDefaults.backendApiKey ?? null;
      }

      return normaliseBackendApiKey(state.settings.backendApiKey ?? null);
    },
    rawSettings: (state): FrontendRuntimeSettings | null => state.settings,
  },

  actions: {
    setSettings(partial: Partial<FrontendRuntimeSettings> = {}) {
      const previousSettings: Partial<FrontendRuntimeSettings> = this.settings ?? {};

      const hasBackendUrl = Object.prototype.hasOwnProperty.call(partial, 'backendUrl');
      const backendUrlSource = hasBackendUrl
        ? partial.backendUrl
        : previousSettings.backendUrl ?? runtimeBackendDefaults.backendUrl;
      const backendUrl = ensureBackendUrl(backendUrlSource);

      const hasBackendApiKey = Object.prototype.hasOwnProperty.call(partial, 'backendApiKey');
      const previousBackendApiKey = Object.prototype.hasOwnProperty.call(previousSettings, 'backendApiKey')
        ? ensureBackendApiKey(previousSettings.backendApiKey)
        : runtimeBackendDefaults.backendApiKey ?? null;
      const backendApiKey = hasBackendApiKey
        ? ensureBackendApiKey(partial.backendApiKey)
        : previousBackendApiKey;

      const merged: FrontendRuntimeSettings = {
        ...(this.settings ?? {}),
        ...partial,
        backendUrl,
        backendApiKey,
      };

      this.settings = merged;
      this.isLoaded = true;
    },

    async loadSettings(force = false) {
      if (this.isLoaded && !force) {
        return;
      }

      this.isLoading = true;
      this.error = null;

      try {
        const payload = await loadFrontendSettings();
        if (!payload) {
          throw new Error('Received empty settings response');
        }
        this.setSettings(payload);
      } catch (error: unknown) {
        this.error = error;
        if (!this.isLoaded) {
          this.setSettings({ backendUrl: runtimeBackendDefaults.backendUrl });
        }
        throw error;
      } finally {
        this.isLoading = false;
      }
    },

    reset() {
      this.settings = null;
      this.isLoaded = false;
      this.isLoading = false;
      this.error = null;
    },
  },
});

export type SettingsStore = ReturnType<typeof useSettingsStore>;

export const getRuntimeBackendDefaults = () => ({
  backendUrl: runtimeBackendDefaults.backendUrl,
  backendApiKey: runtimeBackendDefaults.backendApiKey ?? null,
});

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
} => {
  const store = tryGetSettingsStore();
  if (store) {
    return {
      backendUrl: sanitizeBackendBaseUrl(store.backendUrl),
      backendApiKey: normaliseBackendApiKey(store.backendApiKey),
    };
  }

  return getRuntimeBackendDefaults();
};

export const getResolvedBackendUrl = (): string => getResolvedBackendSettings().backendUrl;

export const getResolvedBackendApiKey = (): string | null => getResolvedBackendSettings().backendApiKey;
