import type { ApiResponseMeta, ApiResult } from '@/types';
import { ApiError } from '@/types';
import { buildAuthenticatedHeaders } from '@/utils/httpAuth';

export type RequestTarget = Parameters<typeof fetch>[0];

export type ResponseParseMode = 'auto' | 'json' | 'text' | 'none';

export interface ApiRequestInit extends RequestInit {
  /**
   * Controls how the response payload should be parsed.
   *
   * - `auto`: attempt to parse JSON when possible and fall back to text
   * - `json`: always attempt JSON parsing
   * - `text`: always attempt text parsing
   * - `none`: skip payload parsing entirely
   */
  parseMode?: ResponseParseMode;
}

export interface ApiRequestResult<TPayload = unknown> {
  data: TPayload | null;
  meta: ApiResponseMeta;
  response: Response;
}

export interface BlobResult {
  blob: Blob;
  response: Response;
  meta: ApiResponseMeta;
}

const DEFAULT_CREDENTIALS: RequestCredentials = 'same-origin';

const hasReadableBody = (response: Response): boolean => {
  if (!response) {
    return false;
  }
  if (response.status === 204 || response.status === 205 || response.status === 304) {
    return false;
  }
  return typeof response.headers?.get === 'function' || typeof response.text === 'function';
};

const parseJsonSafely = async (response: Response) => {
  if (typeof response.json !== 'function') {
    return null;
  }

  try {
    return await response.json();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[apiClient] Failed to parse JSON response', error);
    }
    return null;
  }
};

const parseTextSafely = async (response: Response) => {
  if (typeof response.text !== 'function') {
    return null;
  }

  try {
    return await response.text();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[apiClient] Failed to read text response', error);
    }
    return null;
  }
};

const shouldTreatAsJson = (response: Response, mode: ResponseParseMode): boolean => {
  if (mode === 'json') {
    return true;
  }
  if (mode !== 'auto') {
    return false;
  }
  const contentType = typeof response.headers?.get === 'function'
    ? response.headers.get('content-type') ?? ''
    : '';
  return contentType.includes('application/json') || contentType.includes('+json');
};

const parseResponsePayload = async (
  response: Response,
  mode: ResponseParseMode,
): Promise<unknown> => {
  if (mode === 'none' || !hasReadableBody(response)) {
    return null;
  }

  if (shouldTreatAsJson(response, mode)) {
    const parsed = await parseJsonSafely(response);
    if (parsed !== null || mode === 'json') {
      return parsed;
    }
  }

  if (mode === 'text' || mode === 'auto') {
    return await parseTextSafely(response);
  }

  return null;
};

const deriveErrorMessage = (payload: unknown, response: Response): string => {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const detail = record.detail;
    const message = record.message;
    const errors = record.errors;

    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }

    if (Array.isArray(detail)) {
      const first = detail.find((value) => typeof value === 'string' && value.trim());
      if (typeof first === 'string') {
        return first;
      }
    }

    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    if (typeof errors === 'string' && errors.trim()) {
      return errors;
    }

    if (Array.isArray(errors)) {
      const firstError = errors.find((value) => typeof value === 'string' && value.trim());
      if (typeof firstError === 'string') {
        return firstError;
      }
    }
  }

  return response.statusText || `Request failed with status ${response.status}`;
};

const toResponseMeta = (response: Response): ApiResponseMeta => ({
  ok: response.ok,
  status: response.status,
  statusText: response.statusText,
  headers: response.headers,
  url: response.url,
});

const prepareRequestInit = ({ parseMode: _ignored, ...init }: ApiRequestInit = {}): RequestInit => {
  const { headers, credentials, ...rest } = init;

  return {
    credentials: credentials ?? DEFAULT_CREDENTIALS,
    ...rest,
    headers: buildAuthenticatedHeaders(headers),
  } satisfies RequestInit;
};

export const performRequest = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiRequestResult<TPayload>> => {
  const requestInit = prepareRequestInit(init);
  const response = await fetch(input, requestInit);
  const meta = toResponseMeta(response);
  const payload = await parseResponsePayload(response, init.parseMode ?? 'auto');

  if (!response.ok) {
    throw new ApiError<TPayload>({
      message: deriveErrorMessage(payload, response),
      status: response.status,
      statusText: response.statusText,
      payload: (payload as TPayload | null) ?? null,
      meta,
      response,
    });
  }

  return {
    data: (payload as TPayload | null) ?? null,
    meta,
    response,
  } satisfies ApiRequestResult<TPayload>;
};

export const fetchParsed = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<TPayload> => {
  const { data } = await performRequest<TPayload>(input, { ...init, parseMode: init.parseMode ?? 'auto' });
  return (data as TPayload) ?? (null as TPayload);
};

export const fetchJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<TPayload> => {
  const { data } = await performRequest<TPayload>(input, { ...init, parseMode: 'json' });
  return (data as TPayload) ?? (null as TPayload);
};

export const fetchText = async (
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<string | null> => {
  const { data } = await performRequest<string | null>(input, { ...init, parseMode: 'text' });
  return data ?? null;
};

export const fetchVoid = async (
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<void> => {
  await performRequest(input, { ...init, parseMode: 'none' });
};

const ensureHeaders = (init?: HeadersInit): Headers => {
  return new Headers(init ?? {});
};

const createJsonInit = (method: string, body: unknown, options: RequestInit = {}): RequestInit => {
  const headers = ensureHeaders(options.headers);
  if (!(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const payload = body instanceof FormData ? body : JSON.stringify(body);

  return {
    ...options,
    method,
    headers,
    body: payload,
  } satisfies RequestInit;
};

export const requestParsed = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiRequestResult<TPayload>> => performRequest<TPayload>(input, init);

export const requestJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiResult<TPayload>> => {
  const result = await performRequest<TPayload>(input, { ...init, parseMode: 'json' });
  return { data: result.data, meta: result.meta } satisfies ApiResult<TPayload>;
};

export const getJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiResult<TPayload>> => requestJson<TPayload>(input, { ...init, method: 'GET' });

export const postJson = async <TResponse = unknown, TBody = unknown>(
  input: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => requestJson<TResponse>(input, createJsonInit('POST', body, init));

export const putJson = async <TResponse = unknown, TBody = unknown>(
  input: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => requestJson<TResponse>(input, createJsonInit('PUT', body, init));

export const patchJson = async <TResponse = unknown, TBody = unknown>(
  input: RequestTarget,
  body: TBody,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => requestJson<TResponse>(input, createJsonInit('PATCH', body, init));

export const deleteRequest = async <TResponse = unknown>(
  input: RequestTarget,
  init: ApiRequestInit = {},
): Promise<ApiResult<TResponse>> => requestJson<TResponse>(input, { ...init, method: 'DELETE' });

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

const mergeRequestInit = (
  baseInit: ApiRequestInit = {},
  overrideInit: ApiRequestInit = {},
): ApiRequestInit => {
  const headers = buildAuthenticatedHeaders(baseInit.headers, overrideInit.headers);
  const parseMode = overrideInit.parseMode ?? baseInit.parseMode;
  const credentials = overrideInit.credentials ?? baseInit.credentials ?? DEFAULT_CREDENTIALS;
  const signal = overrideInit.signal ?? baseInit.signal;

  const merged: ApiRequestInit = {
    ...baseInit,
    ...overrideInit,
    headers,
    credentials,
  } satisfies ApiRequestInit;

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
  const init = mergeRequestInit(config.init, overrides);
  return performRequest<TPayload>(target, init);
};

export const requestConfiguredJson = async <TPayload = unknown>(
  config: ApiRequestConfig,
  overrides: ApiRequestInit = {},
): Promise<ApiResult<TPayload>> => {
  const target = resolveRequestTarget(config.target);
  const init = mergeRequestInit(config.init, overrides);
  return requestJson<TPayload>(target, init);
};

export const requestBlob = async (
  input: RequestTarget,
  init: RequestInit = {},
): Promise<BlobResult> => {
  const requestInit = prepareRequestInit(init);
  const response = await fetch(input, requestInit);
  const meta = toResponseMeta(response);

  if (!response.ok) {
    const payload = await parseResponsePayload(response, 'auto');
    throw new ApiError({
      message: deriveErrorMessage(payload, response),
      status: response.status,
      statusText: response.statusText,
      payload: payload ?? null,
      meta,
      response,
    });
  }

  const blob = await response.blob();
  return { blob, response, meta } satisfies BlobResult;
};

export function ensureData<T>(result: ApiResult<T>): T {
  if (result.data == null) {
    throw new Error('Request did not return a response body');
  }
  return result.data;
}

export function getFilenameFromContentDisposition(header?: string | null): string | null {
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
}

