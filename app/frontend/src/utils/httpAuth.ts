import runtimeConfig from '@/config/runtime';
import { getBackendApiKey } from '@/config/backendSettings';
import { getBackendEnvironmentSnapshot, normaliseBackendApiKey } from '@/services/backendEnvironment';

export const API_AUTH_HEADER = 'X-API-Key';

type HeaderEntry = {
  key: string;
  value: string;
};

export const getActiveApiKey = (): string | null => {
  const environment = getBackendEnvironmentSnapshot();
  const candidate = normaliseBackendApiKey(environment.backendApiKey);
  if (candidate) {
    return candidate;
  }

  if (environment.hasExplicitBackendApiKey) {
    return null;
  }

  const configuredKey = getBackendApiKey();
  if (configuredKey) {
    return configuredKey;
  }

  return normaliseBackendApiKey(runtimeConfig.backendApiKey);
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

const collectHeaders = (sources: Array<HeadersInit | undefined>): Map<string, HeaderEntry> => {
  const accumulator = new Map<string, HeaderEntry>();
  sources.forEach((source) => applyHeaderSource(accumulator, source));
  return accumulator;
};

/** Merges header sources left to right, matching names case-insensitively. Adds no auth. */
export const mergeHeaders = (...sources: Array<HeadersInit | undefined>): HeadersInit =>
  toHeadersInit(collectHeaders(sources));

/**
 * Merges header sources like {@link mergeHeaders} and adds the active API key unless a source
 * already set it. The shared HTTP client (`services/shared/http`) is the only caller in the app.
 */
export const buildAuthenticatedHeaders = (
  ...sources: Array<HeadersInit | undefined>
): HeadersInit => {
  const accumulator = collectHeaders(sources);

  if (!accumulator.has(normaliseKey(API_AUTH_HEADER))) {
    const apiKey = getActiveApiKey();
    if (apiKey) {
      applyHeader(accumulator, API_AUTH_HEADER, apiKey);
    }
  }

  return toHeadersInit(accumulator);
};
