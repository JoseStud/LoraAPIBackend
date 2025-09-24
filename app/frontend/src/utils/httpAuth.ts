import runtimeConfig from '@/config/runtime';

export const API_AUTH_HEADER = 'X-API-Key';

type HeaderEntry = {
  key: string;
  value: string;
};

const sanitiseApiKey = (value?: string | null): string | null => {
  if (value == null) {
    return null;
  }

  const trimmed = `${value}`.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readWindowApiKey = (): string | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const win = window as typeof window & {
    BACKEND_API_KEY?: string | null;
  };

  return sanitiseApiKey(win.BACKEND_API_KEY ?? null);
};

export const getActiveApiKey = (): string | null => {
  return readWindowApiKey() ?? sanitiseApiKey(runtimeConfig.backendApiKey);
};

const normaliseKey = (key: string): string => key.toLowerCase();

const applyHeader = (
  accumulator: Map<string, HeaderEntry>,
  key: string,
  value: string,
) => {
  if (!key) {
    return;
  }

  const normalised = normaliseKey(key);
  accumulator.set(normalised, { key, value });
};

const applyHeaderSource = (
  accumulator: Map<string, HeaderEntry>,
  source?: HeadersInit,
) => {
  if (!source) {
    return;
  }

  if (typeof Headers !== 'undefined' && source instanceof Headers) {
    source.forEach((value, key) => {
      applyHeader(accumulator, key, value);
    });
    return;
  }

  if (Array.isArray(source)) {
    source.forEach(([key, value]) => {
      if (key == null || value == null) {
        return;
      }
      applyHeader(accumulator, String(key), String(value));
    });
    return;
  }

  Object.entries(source).forEach(([key, value]) => {
    if (value == null) {
      return;
    }
    applyHeader(accumulator, key, String(value));
  });
};

const toHeadersInit = (accumulator: Map<string, HeaderEntry>): HeadersInit => {
  const record: Record<string, string> = {};
  accumulator.forEach(({ key, value }) => {
    record[key] = value;
  });
  return record;
};

export const buildAuthenticatedHeaders = (
  ...sources: Array<HeadersInit | undefined>
): HeadersInit => {
  const accumulator = new Map<string, HeaderEntry>();
  sources.forEach((source) => applyHeaderSource(accumulator, source));

  if (!accumulator.has(normaliseKey(API_AUTH_HEADER))) {
    const apiKey = getActiveApiKey();
    if (apiKey) {
      applyHeader(accumulator, API_AUTH_HEADER, apiKey);
    }
  }

  return toHeadersInit(accumulator);
};
