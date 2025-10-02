import type { MaybeRefOrGetter } from 'vue';

import { createHttpClient, type CreateHttpClientConfig, type HttpClient } from './createHttpClient';
import { resolveBackendBaseUrl, resolveBackendUrl, useBackendBase } from '@/utils/backend';

export type BackendHttpClientInput = HttpClient | string | null | undefined;

export interface BackendHttpClientOptions extends Omit<CreateHttpClientConfig, 'baseURL'> {
  baseURL?: string | (() => string | null | undefined);
}

export type BackendBaseOverride = string | null | undefined | (() => string | null | undefined);

const normaliseBaseResolver = (
  baseURL?: BackendHttpClientOptions['baseURL'],
): (() => string | null) => {
  if (typeof baseURL === 'function') {
    return () => {
      try {
        const resolved = baseURL();
        if (typeof resolved === 'string' && resolved.trim()) {
          return resolveBackendBaseUrl(resolved);
        }
        return resolved ?? resolveBackendBaseUrl();
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[http] Failed to resolve backend base override', error);
        }
        return resolveBackendBaseUrl();
      }
    };
  }

  if (typeof baseURL === 'string' && baseURL.trim()) {
    return () => resolveBackendBaseUrl(baseURL);
  }

  return () => resolveBackendBaseUrl();
};

export const createBackendHttpClient = (options: BackendHttpClientOptions = {}): HttpClient => {
  const { baseURL, ...rest } = options;
  const resolveBase = normaliseBaseResolver(baseURL);

  return createHttpClient({
    ...rest,
    baseURL: resolveBase,
  });
};

export type BackendClient = HttpClient;

const defaultBackendClient = createBackendHttpClient();

export const createBackendClient = (override?: BackendBaseOverride): BackendClient =>
  createBackendHttpClient({ baseURL: override });

export const resolveBackendClient = (client?: BackendHttpClientInput): BackendClient => {
  if (typeof client === 'string') {
    return createBackendClient(client);
  }

  if (!client) {
    return defaultBackendClient;
  }

  return client;
};

export const useBackendClient = (override?: MaybeRefOrGetter<string | null>): BackendClient => {
  const backendBase = useBackendBase(override);
  return createBackendClient(() => backendBase.value);
};

export const resolveBackendPath = (path: string, client?: BackendClient): string => {
  if (client) {
    return client.resolve(path);
  }
  return resolveBackendUrl(path);
};
