const normaliseApiKey = (value?: string | null): string | null => {
  if (value == null) {
    return null;
  }

  const trimmed = `${value}`.trim();
  return trimmed.length > 0 ? trimmed : null;
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
