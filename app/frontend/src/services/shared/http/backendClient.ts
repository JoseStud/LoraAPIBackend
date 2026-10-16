import type { MaybeRefOrGetter } from 'vue';

import {
  createHttpClient,
  type ApiRequestInit,
  type ApiResult,
  type BlobResult,
  type CreateHttpClientConfig,
  type HttpClient,
} from './createHttpClient';
import {
  createBackendPathBuilder,
  resolveBackendBaseUrl,
  useBackendBase,
  type BackendPathBuilder,
} from '@/utils/backend';

/** An HTTP client whose base URL is the configured backend API root. */
export type BackendHttpClient = HttpClient;

/** A client, a backend base URL override, or nothing for the default backend client. */
export type BackendHttpClientInput = BackendHttpClient | string | null | undefined;

export type BackendBaseOverride =
  | string
  | null
  | undefined
  | (() => string | null | undefined);

export interface BackendHttpClientOptions extends Omit<CreateHttpClientConfig, 'baseURL'> {
  baseURL?: BackendBaseOverride;
}

const createBaseResolver = (override?: BackendBaseOverride): (() => string) => {
  if (typeof override === 'function') {
    return () => {
      try {
        return resolveBackendBaseUrl(override() ?? undefined);
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[http] Failed to resolve backend base override', error);
        }
        return resolveBackendBaseUrl();
      }
    };
  }

  return () => resolveBackendBaseUrl(override ?? undefined);
};

/** Creates a client that resolves relative paths against the backend base URL on every request. */
export const createBackendHttpClient = (options: BackendHttpClientOptions = {}): BackendHttpClient => {
  const { baseURL, ...rest } = options;
  return createHttpClient({ ...rest, baseURL: createBaseResolver(baseURL) });
};

export const createBackendClient = (override?: BackendBaseOverride): BackendHttpClient =>
  createBackendHttpClient({ baseURL: override });

const defaultBackendClient = createBackendClient();

export const resolveBackendClient = (input?: BackendHttpClientInput): BackendHttpClient => {
  if (typeof input === 'string') {
    return createBackendClient(input);
  }

  return input ?? defaultBackendClient;
};

export const useBackendClient = (override?: MaybeRefOrGetter<string | null>): BackendHttpClient => {
  const backendBase = useBackendBase(override);
  return createBackendClient(() => backendBase.value);
};

export const resolveBackendPath = (path: string, input?: BackendHttpClientInput): string =>
  resolveBackendClient(input).resolve(path);

export interface BackendPathResolver {
  path: BackendPathBuilder;
  resolve: (path?: string, input?: BackendHttpClientInput) => string;
}

/** Builds paths under `basePath` and resolves them to absolute backend URLs. */
export const createBackendPathResolver = (basePath: string): BackendPathResolver => {
  const path = createBackendPathBuilder(basePath);
  const resolve = (suffix = '', input?: BackendHttpClientInput): string =>
    resolveBackendPath(path(suffix), input);

  return { path, resolve };
};

export type { ApiRequestInit, ApiResult, BlobResult };
