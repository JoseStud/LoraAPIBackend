import { defineStore } from 'pinia';

import { loadFrontendSettings } from '@/services/systemService';
import type { FrontendRuntimeSettings, SettingsState } from '@/types';

const normalizeBackendUrl = (value?: string | null): string => {
  if (!value) {
    return '';
  }
  return value.replace(/\/+$/, '');
};

const applyWindowGlobals = (settings: FrontendRuntimeSettings | null) => {
  if (typeof window === 'undefined') {
    return;
  }

  const win = window as typeof window & {
    BACKEND_URL?: string;
    BACKEND_API_KEY?: string | null;
    __APP_SETTINGS__?: FrontendRuntimeSettings | null;
  };

  if (settings) {
    win.BACKEND_URL = normalizeBackendUrl(settings.backendUrl);
    win.BACKEND_API_KEY = settings.backendApiKey ?? '';
    win.__APP_SETTINGS__ = settings;
  } else {
    win.__APP_SETTINGS__ = null;
    win.BACKEND_URL = '';
    win.BACKEND_API_KEY = '';
  }
};

export const useSettingsStore = defineStore('app-settings', {
  state: (): SettingsState => ({
    settings: null,
    isLoading: false,
    isLoaded: false,
    error: null,
  }),

  getters: {
    backendUrl: (state): string => normalizeBackendUrl(state.settings?.backendUrl),
    backendApiKey: (state): string | null => state.settings?.backendApiKey ?? null,
    rawSettings: (state): FrontendRuntimeSettings | null => state.settings,
  },

  actions: {
    setSettings(partial: Partial<FrontendRuntimeSettings> = {}) {
      const backendUrl = normalizeBackendUrl(
        partial.backendUrl ?? (this.settings?.backendUrl ?? '')
      );
      const backendApiKey =
        partial.backendApiKey ?? (this.settings?.backendApiKey ?? null);

      const merged: FrontendRuntimeSettings = {
        ...(this.settings ?? {}),
        ...partial,
        backendUrl,
        backendApiKey,
      };

      this.settings = merged;
      this.isLoaded = true;
      applyWindowGlobals(merged);
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
          this.setSettings({ backendUrl: this.settings?.backendUrl ?? '' });
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
      applyWindowGlobals(null);
    },
  },
});
