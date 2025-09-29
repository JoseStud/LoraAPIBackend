import { computed, reactive, readonly } from 'vue';

import runtimeConfig from '@/config/runtime';

export interface BackendSettingsState {
  backendUrl: string;
  backendApiKey: string | null;
}

type BackendSettingsUpdate = {
  backendUrl?: string | null;
  backendApiKey?: string | null;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');
const normaliseApiKey = (value: string | null): string | null => {
  if (value == null) {
    return null;
  }

  const trimmed = `${value}`.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const initialState: BackendSettingsState = {
  backendUrl: trimTrailingSlash(runtimeConfig.backendBasePath),
  backendApiKey: normaliseApiKey(runtimeConfig.backendApiKey ?? null),
};

const state = reactive<BackendSettingsState>({
  backendUrl: initialState.backendUrl,
  backendApiKey: initialState.backendApiKey,
});

const backendUrlRef = computed(() => state.backendUrl);
const backendApiKeyRef = computed(() => state.backendApiKey);

export const backendSettingsState = readonly(state);

export const updateBackendSettings = (update: BackendSettingsUpdate = {}): void => {
  if (Object.prototype.hasOwnProperty.call(update, 'backendUrl')) {
    const raw = update.backendUrl ?? '';
    const stringified = String(raw).trim();
    state.backendUrl = stringified ? trimTrailingSlash(stringified) : '';
  }

  if (Object.prototype.hasOwnProperty.call(update, 'backendApiKey')) {
    const raw = update.backendApiKey ?? null;
    state.backendApiKey = normaliseApiKey(raw);
  }
};

export const resetBackendSettings = (): void => {
  state.backendUrl = initialState.backendUrl;
  state.backendApiKey = initialState.backendApiKey;
};

export const getBackendUrl = (): string => backendUrlRef.value;
export const getBackendApiKey = (): string | null => backendApiKeyRef.value;

export const useBackendSettings = () => ({
  backendUrl: backendUrlRef,
  backendApiKey: backendApiKeyRef,
});

export default {
  state: backendSettingsState,
  update: updateBackendSettings,
  reset: resetBackendSettings,
  use: useBackendSettings,
  getBackendUrl,
  getBackendApiKey,
};
