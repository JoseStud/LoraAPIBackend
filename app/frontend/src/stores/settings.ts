import { defineStore } from 'pinia';

import { resetBackendSettings, updateBackendSettings } from '@/config/backendSettings';
import { loadFrontendSettings } from '@/services';
import { trimTrailingSlash } from '@/utils/backend';
import type { FrontendRuntimeSettings, SettingsState } from '@/types';

export const useSettingsStore = defineStore('app-settings', {
  state: (): SettingsState => ({
    settings: null,
    isLoading: false,
    isLoaded: false,
    error: null,
  }),

  getters: {
    backendUrl: (state): string => (typeof state.settings?.backendUrl === 'string'
      ? trimTrailingSlash(state.settings.backendUrl)
      : ''
    ),
    backendApiKey: (state): string | null => state.settings?.backendApiKey ?? null,
    rawSettings: (state): FrontendRuntimeSettings | null => state.settings,
  },

  actions: {
    setSettings(partial: Partial<FrontendRuntimeSettings> = {}) {
      const backendUrlSource = partial.backendUrl ?? this.settings?.backendUrl ?? '';
      const backendUrl = trimTrailingSlash(backendUrlSource);
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
      updateBackendSettings({
        backendUrl,
        backendApiKey,
      });
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
      resetBackendSettings();
    },
  },
});
