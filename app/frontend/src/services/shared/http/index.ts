import {
  createHttpClient,
  type ApiRequestInit,
  type ApiRequestResult,
  type ApiResult,
  type BlobResult,
  type CreateHttpClientConfig,
  type HttpClient,
  type RequestTarget,
} from './createHttpClient';
import {
  createBackendClient,
  createBackendHttpClient,
  resolveBackendClient,
  resolveBackendPath,
  useBackendClient,
  type BackendBaseOverride,
  type BackendHttpClient,
  type BackendHttpClientInput,
} from './backendClient';
import { buildAuthenticatedHeaders } from '@/utils/httpAuth';

export {
  createHttpClient,
  createBackendHttpClient,
  createBackendClient,
  resolveBackendClient,
  resolveBackendPath,
  useBackendClient,
};

export type {
  ApiRequestInit,
  ApiRequestResult,
  ApiResult,
  BlobResult,
  CreateHttpClientConfig,
  HttpClient,
  RequestTarget,
  BackendBaseOverride,
  BackendHttpClient,
  BackendHttpClientInput,
};

let defaultHttpClient: HttpClient | null = null;

export const resolveHttpClient = (client?: HttpClient | null): HttpClient => {
  if (client) {
    return client;
  }

  if (!defaultHttpClient) {
    defaultHttpClient = createHttpClient();
  }

  return defaultHttpClient;
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
  target: RequestTarget,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<ApiRequestResult<TPayload>> => resolveHttpClient(client).request<TPayload>(target, init);

export const requestJson = async <TPayload = unknown>(
  target: RequestTarget,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<ApiResult<TPayload>> => resolveHttpClient(client).requestJson<TPayload>(target, init);

export const getJson = async <TPayload = unknown>(
  target: RequestTarget,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<TPayload | null> => resolveHttpClient(client).getJson<TPayload>(target, init);

export const postJson = async <TResponse = unknown, TBody = unknown>(
  target: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<ApiResult<TResponse>> => resolveHttpClient(client).postJson<TResponse, TBody>(target, body, init);

export const putJson = async <TResponse = unknown, TBody = unknown>(
  target: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<ApiResult<TResponse>> => resolveHttpClient(client).putJson<TResponse, TBody>(target, body, init);

export const patchJson = async <TResponse = unknown, TBody = unknown>(
  target: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<ApiResult<TResponse>> => resolveHttpClient(client).patchJson<TResponse, TBody>(target, body, init);

export const deleteRequest = async <TResponse = unknown>(
  target: RequestTarget,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<ApiResult<TResponse>> => resolveHttpClient(client).delete<TResponse>(target, init);

export const requestBlob = async (
  target: RequestTarget,
  init: RequestInit = {},
  client?: HttpClient | null,
): Promise<BlobResult> => resolveHttpClient(client).requestBlob(target, init);

export const fetchParsed = async <TPayload = unknown>(
  target: RequestTarget,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<TPayload> => {
  const result = await performRequest<TPayload>(target, init, client);
  return (result.data as TPayload) ?? (null as TPayload);
};

export const fetchJson = async <TPayload = unknown>(
  target: RequestTarget,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<TPayload> => {
  const result = await requestJson<TPayload>(target, init, client);
  return (result.data as TPayload) ?? (null as TPayload);
};

export const fetchText = async (
  target: RequestTarget,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<string | null> => {
  const result = await performRequest<string | null>(
    target,
    { ...init, parseMode: 'text' },
    client,
  );
  return result.data ?? null;
};

export const fetchVoid = async (
  target: RequestTarget,
  init: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<void> => {
  await performRequest(target, { ...init, parseMode: 'none' }, client);
};

export const performConfiguredRequest = async <TPayload = unknown>(
  config: ApiRequestConfig,
  overrides: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<ApiRequestResult<TPayload>> => {
  const target = resolveRequestTarget(config.target);
  const init = mergeConfiguredInit(config.init, overrides);
  return resolveHttpClient(client).request<TPayload>(target, init);
};

export const requestConfiguredJson = async <TPayload = unknown>(
  config: ApiRequestConfig,
  overrides: ApiRequestInit = {},
  client?: HttpClient | null,
): Promise<ApiResult<TPayload>> => {
  const target = resolveRequestTarget(config.target);
  const init = mergeConfiguredInit(config.init, overrides);
  return resolveHttpClient(client).requestJson<TPayload>(target, init);
};

export const ensureData = <T>(result: ApiResult<T>): T => {
  if (result.data == null) {
    throw new Error('Request did not return a response body');
  }
  return result.data;
};

export const getFilenameFromContentDisposition = (header?: string | null): string | null => {
  if (!header) {
    return null;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const asciiMatch = header.match(/filename="?([^";]+)"?/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }

  return null;
};
