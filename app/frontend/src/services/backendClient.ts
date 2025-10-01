import type { MaybeRefOrGetter } from 'vue';

import {
  createHttpClient,
  type ApiRequestInit,
  type ApiResult,
  type BlobResult,
  type HttpClient,
} from '@/services/httpClient';
import { resolveBackendBaseUrl, resolveBackendUrl, useBackendBase } from '@/utils/backend';

export interface BackendClient {
  resolve: (path?: string) => string;
  requestJson: <TPayload = unknown>(path: string, init?: ApiRequestInit) => Promise<ApiResult<TPayload>>;
  getJson: <TPayload = unknown>(path: string, init?: ApiRequestInit) => Promise<TPayload | null>;
  postJson: <TResponse = unknown, TBody = unknown>(
    path: string,
    body: TBody,
    init?: ApiRequestInit,
  ) => Promise<ApiResult<TResponse>>;
  putJson: <TResponse = unknown, TBody = unknown>(
    path: string,
    body: TBody,
    init?: ApiRequestInit,
  ) => Promise<ApiResult<TResponse>>;
  patchJson: <TResponse = unknown, TBody = unknown>(
    path: string,
    body: TBody,
    init?: ApiRequestInit,
  ) => Promise<ApiResult<TResponse>>;
  delete: <TResponse = unknown>(path: string, init?: ApiRequestInit) => Promise<ApiResult<TResponse>>;
  requestBlob: (path: string, init?: RequestInit) => Promise<BlobResult>;
}

export type BackendBaseOverride =
  | string
  | null
  | undefined
  | (() => string | null | undefined);

const createBackendHttpClient = (resolveBase: () => string): HttpClient => {
  return createHttpClient({
    baseUrl: () => resolveBase(),
  });
};

const createClientFromResolver = (resolveBase: () => string): BackendClient => {
  const httpClient = createBackendHttpClient(resolveBase);

  const resolvePath = (path = ''): string => {
    if (!path) {
      return resolveBase();
    }
    return httpClient.resolve(path);
  };

  return {
    resolve: resolvePath,
    requestJson: <TPayload>(path: string, init?: ApiRequestInit) => httpClient.requestJson<TPayload>(path, init),
    getJson: async <TPayload>(path: string, init?: ApiRequestInit) => {
      const result = await httpClient.requestJson<TPayload>(path, init);
      return (result.data as TPayload | null) ?? null;
    },
    postJson: <TResponse, TBody>(path: string, body: TBody, init?: ApiRequestInit) =>
      httpClient.postJson<TResponse, TBody>(path, body, init),
    putJson: <TResponse, TBody>(path: string, body: TBody, init?: ApiRequestInit) =>
      httpClient.putJson<TResponse, TBody>(path, body, init),
    patchJson: <TResponse, TBody>(path: string, body: TBody, init?: ApiRequestInit) =>
      httpClient.patchJson<TResponse, TBody>(path, body, init),
    delete: <TResponse>(path: string, init?: ApiRequestInit) => httpClient.delete<TResponse>(path, init),
    requestBlob: (path: string, init?: RequestInit) => httpClient.requestBlob(path, init),
  } satisfies BackendClient;
};

const resolveOverrideBase = (override?: BackendBaseOverride): (() => string) => {
  if (typeof override === 'function') {
    return () => resolveBackendBaseUrl(override() ?? undefined);
  }

  return () => resolveBackendBaseUrl(override ?? undefined);
};

const defaultClient = createClientFromResolver(resolveOverrideBase());

export const createBackendClient = (override?: BackendBaseOverride): BackendClient =>
  createClientFromResolver(resolveOverrideBase(override));

export const resolveBackendClient = (client?: BackendClient | null): BackendClient => client ?? defaultClient;

export const useBackendClient = (override?: MaybeRefOrGetter<string | null>): BackendClient => {
  const backendBase = useBackendBase(override);
  return createClientFromResolver(() => backendBase.value);
};

export const resolveBackendPath = (path: string, client?: BackendClient): string => {
  if (client) {
    return client.resolve(path);
  }
  return resolveBackendUrl(path);
};

export type { ApiRequestInit, ApiResult, BlobResult };
