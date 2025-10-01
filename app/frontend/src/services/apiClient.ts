import {
  createHttpClient,
  ensureData,
  type ApiRequestInit,
  type ApiRequestResult,
  type BlobResult,
  type HttpClient,
  type HttpClientErrorEvent,
  type HttpClientHooks,
  type HttpClientOptions,
  type HttpClientRequestEvent,
  type HttpClientResponseEvent,
  type HttpClientRetryEvent,
  type HttpClientTraceEvent,
  type HttpClientTracePhase,
  type HttpRetryContext,
  type RequestTarget,
  type ResponseParseMode,
  type RetryOptions,
} from './httpClient';
import type { ApiResult } from '@/types';
import { buildAuthenticatedHeaders } from '@/utils/httpAuth';

const defaultClient = createHttpClient();

export {
  createHttpClient,
  ensureData,
  type ApiRequestInit,
  type ApiRequestResult,
  type BlobResult,
  type HttpClient,
  type HttpClientErrorEvent,
  type HttpClientHooks,
  type HttpClientOptions,
  type HttpClientRequestEvent,
  type HttpClientResponseEvent,
  type HttpClientRetryEvent,
  type HttpClientTraceEvent,
  type HttpClientTracePhase,
  type HttpRetryContext,
  type RequestTarget,
  type ResponseParseMode,
  type RetryOptions,
} from './httpClient';

export const performRequest = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiRequestResult<TPayload>> => defaultClient.request<TPayload>(input, init);

export const fetchParsed = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<TPayload> => defaultClient.fetchParsed<TPayload>(input, init);

export const fetchJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<TPayload> => defaultClient.fetchJson<TPayload>(input, init);

export const fetchText = async (
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<string | null> => defaultClient.fetchText(input, init);

export const fetchVoid = async (
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<void> => defaultClient.fetchVoid(input, init);

export const requestParsed = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiRequestResult<TPayload>> => defaultClient.request<TPayload>(input, init);

export const requestJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiResult<TPayload>> => defaultClient.requestJson<TPayload>(input, init);

export const getJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiResult<TPayload>> => defaultClient.getJson<TPayload>(input, init);

export const postJson = async <TResponse = unknown, TBody = unknown>(
  input: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => defaultClient.postJson<TResponse, TBody>(input, body, init);

export const putJson = async <TResponse = unknown, TBody = unknown>(
  input: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => defaultClient.putJson<TResponse, TBody>(input, body, init);

export const patchJson = async <TResponse = unknown, TBody = unknown>(
  input: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => defaultClient.patchJson<TResponse, TBody>(input, body, init);

export const deleteRequest = async <TResponse = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => defaultClient.delete<TResponse>(input, init);

export const requestBlob = async (
  input: RequestTarget,
  init: RequestInit = {},
): Promise<BlobResult> => defaultClient.requestBlob(input, init);

export type RequestTargetResolver =
  | RequestTarget
  | (() => RequestTarget | null | undefined);

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
      console.warn('[apiClient] Failed to resolve request target', error);
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

export const performConfiguredRequest = async <TPayload = unknown>(
  config: ApiRequestConfig,
  overrides: ApiRequestInit = {},
): Promise<ApiRequestResult<TPayload>> => {
  const target = resolveRequestTarget(config.target);
  const init = mergeConfiguredInit(config.init, overrides);
  return defaultClient.request<TPayload>(target, init);
};

export const requestConfiguredJson = async <TPayload = unknown>(
  config: ApiRequestConfig,
  overrides: ApiRequestInit = {},
): Promise<ApiResult<TPayload>> => {
  const target = resolveRequestTarget(config.target);
  const init = mergeConfiguredInit(config.init, overrides);
  return defaultClient.requestJson<TPayload>(target, init);
};
