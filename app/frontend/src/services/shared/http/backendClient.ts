import type { MaybeRefOrGetter } from 'vue';

import {
  createHttpClient,
  type ApiRequestInit,
  type ApiResult,
  type BlobResult,
  type CreateHttpClientConfig,
  type HttpClient,
} from './createHttpClient';
import { resolveBackendBaseUrl, resolveBackendUrl, useBackendBase } from '@/utils/backend';

export type BackendHttpClient = HttpClient;

export type BackendHttpClientInput = BackendHttpClient | string | null | undefined;

export interface BackendHttpClientOptions extends Omit<CreateHttpClientConfig, 'baseURL'> {
  baseURL?: string | (() => string | null | undefined);
}

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

export const createBackendHttpClient = (options: BackendHttpClientOptions = {}): BackendHttpClient => {
  const { baseURL, ...rest } = options;
  const resolveBase = normaliseBaseResolver(baseURL);

  return createHttpClient({
    ...rest,
    baseURL: resolveBase,
  });
};

const createClientFromResolver = (resolveBase: () => string): BackendHttpClient => {
  const httpClient = createBackendHttpClient({ baseURL: resolveBase });

  return {
    ...httpClient,
    resolve: (path?: string) => {
      if (!path) {
        return resolveBase();
      }
      return httpClient.resolve(path);
    },
    getJson: async <TPayload>(path: string, init: ApiRequestInit = {}) => {
      const result = await httpClient.requestJson<TPayload>(path, init);
      return (result.data as TPayload | null) ?? null;
    },
  } satisfies BackendHttpClient;
};

export type BackendBaseOverride =
  | string
  | null
  | undefined
  | (() => string | null | undefined);

const resolveOverrideBase = (override?: BackendBaseOverride): (() => string) => {
  if (typeof override === 'function') {
    return () => resolveBackendBaseUrl(override() ?? undefined);
  }

  return () => resolveBackendBaseUrl(override ?? undefined);
};

const defaultBackendClient = createClientFromResolver(resolveOverrideBase());

export const createBackendClient = (override?: BackendBaseOverride): BackendHttpClient =>
  createClientFromResolver(resolveOverrideBase(override));

export const resolveBackendClient = (input?: BackendHttpClientInput): BackendHttpClient => {
  if (typeof input === 'string') {
    return createBackendClient(input);
  }

  if (input == null) {
    return defaultBackendClient;
  }

  return input;
};

export const useBackendClient = (override?: MaybeRefOrGetter<string | null>): BackendHttpClient => {
  const backendBase = useBackendBase(override);
  return createClientFromResolver(() => backendBase.value);
};

export const resolveBackendPath = (path: string, client?: BackendHttpClient): string => {
  if (client) {
    return client.resolve(path);
  }
  return resolveBackendUrl(path);
};

export type { ApiRequestInit, ApiResult, BlobResult };
