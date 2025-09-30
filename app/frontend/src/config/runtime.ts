import { DEFAULT_BACKEND_BASE, sanitizeBackendBaseUrl } from '@/utils/backend/helpers';

interface WindowRuntimeSettings {
  backendUrl?: string | null;
  backendApiKey?: string | null;
  generationPolling?: {
    queueMs?: number | string | null;
    websocketRetryMs?: number | string | null;
    systemStatusMs?: number | string | null;
  } | null;
}

interface AugmentedWindow extends Window {
  BACKEND_URL?: string;
  BACKEND_API_KEY?: string | null;
  __APP_SETTINGS__?: WindowRuntimeSettings | null;
}

const normalizeApiKey = (value?: string | null): string | null => {
  if (value == null) {
    return null;
  }

  const trimmed = `${value}`.trim();
  return trimmed.length ? trimmed : null;
};

const readWindowSettings = (): WindowRuntimeSettings => {
  if (typeof window === 'undefined') {
    return {};
  }

  const win = window as AugmentedWindow;
  const appSettings = win.__APP_SETTINGS__ ?? null;

  return {
    backendUrl: appSettings?.backendUrl ?? win.BACKEND_URL ?? null,
    backendApiKey: appSettings?.backendApiKey ?? win.BACKEND_API_KEY ?? null,
    generationPolling: appSettings?.generationPolling ?? null,
  };
};

const readEnvString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  return undefined;
};

const readEnvPositiveInt = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
};

const readEnvBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalised)) {
      return true;
    }
    if (['0', 'false', 'no', 'off'].includes(normalised)) {
      return false;
    }
  }

  return undefined;
};

const envBackendBase = readEnvString(import.meta.env.VITE_BACKEND_BASE_URL);
if (envBackendBase !== undefined && !envBackendBase.trim()) {
  throw new Error(
    'VITE_BACKEND_BASE_URL is set but empty. Remove it or provide a non-empty value.',
  );
}

const envBackendApiKey =
  readEnvString(import.meta.env.VITE_BACKEND_API_KEY)
  ?? readEnvString(import.meta.env.VITE_API_KEY);
const windowSettings = readWindowSettings();

const backendBasePath = sanitizeBackendBaseUrl(
  envBackendBase ?? windowSettings.backendUrl ?? undefined,
);

const backendApiKey = normalizeApiKey(
  envBackendApiKey ?? windowSettings.backendApiKey ?? null,
);

const windowPolling = windowSettings.generationPolling ?? null;

const runtimePolling = {
  queueMs:
    readEnvPositiveInt(import.meta.env.VITE_GENERATION_QUEUE_POLL_INTERVAL_MS)
    ?? readEnvPositiveInt(windowPolling?.queueMs ?? undefined),
  websocketRetryMs:
    readEnvPositiveInt(import.meta.env.VITE_GENERATION_WEBSOCKET_RETRY_MS)
    ?? readEnvPositiveInt(windowPolling?.websocketRetryMs ?? undefined),
  systemStatusMs:
    readEnvPositiveInt(import.meta.env.VITE_GENERATION_SYSTEM_STATUS_POLL_INTERVAL_MS)
    ?? readEnvPositiveInt(windowPolling?.systemStatusMs ?? undefined),
} as const;

export interface RuntimeConfig {
  mode: string;
  isDev: boolean;
  isProd: boolean;
  isTest: boolean;
  backendBasePath: string;
  backendApiKey: string | null;
  generationPolling: {
    queueMs?: number;
    websocketRetryMs?: number;
    systemStatusMs?: number;
  };
}

const mode =
  readEnvString(import.meta.env.MODE) ?? (import.meta.env.DEV ? 'development' : 'production');
const prod = readEnvBoolean(import.meta.env.PROD);
const dev = readEnvBoolean(import.meta.env.DEV) ?? import.meta.env.DEV ?? false;

export const runtimeConfig: RuntimeConfig = Object.freeze({
  mode,
  isDev: Boolean(dev),
  isProd: typeof prod === 'boolean' ? prod : mode === 'production',
  isTest: mode === 'test',
  backendBasePath,
  backendApiKey,
  generationPolling: runtimePolling,
}) as RuntimeConfig;

export { DEFAULT_BACKEND_BASE };

export default runtimeConfig;
