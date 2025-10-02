import {
  createHttpClient as createConfiguredHttpClient,
  type ApiRequestInit,
  type ApiRequestResult,
  type ApiResult,
  type BlobResult,
  type CreateHttpClientConfig,
  type HttpAuthOptions,
  type HttpClient,
  type HttpTraceLogEntry,
  type HttpTraceOptions,
  type RequestTarget,
  type RetryOptions,
} from './createHttpClient';
import { ensureData, getFilenameFromContentDisposition } from '@/services/httpClient';
import type { ApiResponseMeta } from '@/types';
import { buildAuthenticatedHeaders } from '@/utils/httpAuth';

let defaultClient: HttpClient | null = null;

const getDefaultClient = (): HttpClient => {
  if (!defaultClient) {
    defaultClient = createConfiguredHttpClient();
  }
  return defaultClient;
};

export type {
  ApiRequestInit,
  ApiRequestResult,
  ApiResult,
  BlobResult,
  CreateHttpClientConfig,
  HttpAuthOptions,
  HttpClient,
  HttpTraceLogEntry,
  HttpTraceOptions,
  RequestTarget,
  RetryOptions,
};

export { ensureData, getFilenameFromContentDisposition };
export const createHttpClient = createConfiguredHttpClient;
export const resetDefaultHttpClient = (): void => {
  defaultClient = null;
};

export type RequestTargetResolver = RequestTarget | (() => RequestTarget | null | undefined);

export interface ApiRequestConfig {
  target: RequestTargetResolver;
  init?: ApiRequestInit;
}

const resolveRequestTarget = (resolver: RequestTargetResolver): RequestTarget => {
  try {
    const resolved = typeof resolver === 'function' ? resolver() : resolver;

    if (resolved == null) {
      throw new Error('Invalid API URL');
    }

    if (typeof resolved === 'string') {
      const trimmed = resolved.trim();
      if (!trimmed) {
        throw new Error('Invalid API URL');
      }
      return trimmed;
    }

    return resolved;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[http] Failed to resolve request target', error);
    }
    throw new Error('Invalid API URL');
  }
};

const mergeConfiguredInit = (baseInit: ApiRequestInit = {}, overrideInit: ApiRequestInit = {}): ApiRequestInit => {
  const headers = buildAuthenticatedHeaders(baseInit.headers, overrideInit.headers);
  const credentials = overrideInit.credentials ?? baseInit.credentials;
  const signal = overrideInit.signal ?? baseInit.signal;
  const parseMode = overrideInit.parseMode ?? baseInit.parseMode;

  const merged: ApiRequestInit = {
    ...baseInit,
    ...overrideInit,
    headers,
  } satisfies ApiRequestInit;

  if (credentials !== undefined) {
    merged.credentials = credentials;
  }

  if (parseMode !== undefined) {
    merged.parseMode = parseMode;
  } else {
    delete merged.parseMode;
  }

  if (signal) {
    merged.signal = signal;
  } else {
    delete merged.signal;
  }

  return merged;
};

export const performRequest = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiRequestResult<TPayload>> => getDefaultClient().request<TPayload>(input, init);

export const requestParsed = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiRequestResult<TPayload>> => getDefaultClient().request<TPayload>(input, init);

export const requestJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiResult<TPayload>> => getDefaultClient().requestJson<TPayload>(input, init);

export const getJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiResult<TPayload>> => getDefaultClient().getJson<TPayload>(input, init);

export const postJson = async <TResponse = unknown, TBody = unknown>(
  input: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => getDefaultClient().postJson<TResponse, TBody>(input, body, init);

export const putJson = async <TResponse = unknown, TBody = unknown>(
  input: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => getDefaultClient().putJson<TResponse, TBody>(input, body, init);

export const patchJson = async <TResponse = unknown, TBody = unknown>(
  input: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => getDefaultClient().patchJson<TResponse, TBody>(input, body, init);

export const deleteRequest = async <TResponse = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => getDefaultClient().delete<TResponse>(input, init);

export const fetchParsed = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<TPayload> => getDefaultClient().fetchParsed<TPayload>(input, init);

export const fetchJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<TPayload> => getDefaultClient().fetchJson<TPayload>(input, init);

export const fetchText = async (
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<string | null> => getDefaultClient().fetchText(input, init);

export const fetchVoid = async (
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<void> => getDefaultClient().fetchVoid(input, init);

export const requestBlob = async (
  input: RequestTarget,
  init: RequestInit = {},
): Promise<BlobResult> => getDefaultClient().requestBlob(input, init);

export const performConfiguredRequest = async <TPayload = unknown>(
  config: ApiRequestConfig,
  overrides: ApiRequestInit = {},
): Promise<ApiRequestResult<TPayload>> => {
  const target = resolveRequestTarget(config.target);
  const init = mergeConfiguredInit(config.init, overrides);
  return getDefaultClient().request<TPayload>(target, init);
};

export const requestConfiguredJson = async <TPayload = unknown>(
  config: ApiRequestConfig,
  overrides: ApiRequestInit = {},
): Promise<ApiResult<TPayload>> => {
  const target = resolveRequestTarget(config.target);
  const init = mergeConfiguredInit(config.init, overrides);
  return getDefaultClient().requestJson<TPayload>(target, init);
};

export const createConfiguredRequest = (
  config: ApiRequestConfig,
): (<TPayload = unknown>(overrides?: ApiRequestInit) => Promise<ApiRequestResult<TPayload>>) => {
  return (overrides: ApiRequestInit = {}) => performConfiguredRequest<TPayload>(config, overrides);
};

export const createConfiguredJsonRequest = (
  config: ApiRequestConfig,
): (<TPayload = unknown>(overrides?: ApiRequestInit) => Promise<ApiResult<TPayload>>) => {
  return (overrides: ApiRequestInit = {}) => requestConfiguredJson<TPayload>(config, overrides);
};

export interface ConfiguredRequestBuilder {
  request: <TPayload = unknown>(overrides?: ApiRequestInit) => Promise<ApiRequestResult<TPayload>>;
  requestJson: <TPayload = unknown>(overrides?: ApiRequestInit) => Promise<ApiResult<TPayload>>;
}

export const createRequestBuilder = (config: ApiRequestConfig): ConfiguredRequestBuilder => ({
  request: (overrides?: ApiRequestInit) => performConfiguredRequest(config, overrides),
  requestJson: (overrides?: ApiRequestInit) => requestConfiguredJson(config, overrides),
});

export interface HttpRequestTraceEntry {
  request: RequestInit;
  meta: ApiResponseMeta;
}

export const withRequestTrace = <TPayload = unknown>(
  requestFn: (init?: ApiRequestInit) => Promise<ApiRequestResult<TPayload>>,
): ((init?: ApiRequestInit) => Promise<HttpRequestTraceEntry & ApiRequestResult<TPayload>>) => {
  return async (init?: ApiRequestInit) => {
    const result = await requestFn(init);
    return { ...result, request: init ?? {}, meta: result.meta };
  };
};

