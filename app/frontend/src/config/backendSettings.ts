import { normalizeBackendConfig } from '@/shared/config/backendConfig';

const normaliseApiKey = (value?: string | null): string | null => {
  const { apiKey } = normalizeBackendConfig({ apiKey: value });
  return apiKey;
};

let backendApiKey: string | null = null;

export const getBackendApiKey = (): string | null => backendApiKey;

export const updateBackendSettings = (update: { backendApiKey?: string | null }) => {
  if (Object.prototype.hasOwnProperty.call(update, 'backendApiKey')) {
    backendApiKey = normaliseApiKey(update.backendApiKey);
  }
};

export const resetBackendSettings = () => {
  backendApiKey = null;
};
