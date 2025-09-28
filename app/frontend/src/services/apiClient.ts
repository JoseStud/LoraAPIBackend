import type { ApiResponseMeta } from '@/types';
import { ApiError } from '@/types';
import { buildAuthenticatedHeaders } from '@/utils/httpAuth';

export type RequestTarget = Parameters<typeof fetch>[0];

export type ResponseParseMode = 'auto' | 'json' | 'text' | 'none';

export interface FetchRequestInit extends RequestInit {
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

const prepareRequestInit = (init: FetchRequestInit = {}): RequestInit => {
  const { headers, credentials, ...rest } = init;

  return {
    credentials: credentials ?? DEFAULT_CREDENTIALS,
    ...rest,
    headers: buildAuthenticatedHeaders(headers),
  } satisfies RequestInit;
};

const executeRequest = async <TPayload = unknown>(
  input: RequestTarget,
  init: FetchRequestInit = {},
): Promise<TPayload> => {
  const requestInit = prepareRequestInit(init);
  const response = await fetch(input, requestInit);
  const meta = toResponseMeta(response);
  const payload = await parseResponsePayload(response, init.parseMode ?? 'auto');

  if (!response.ok) {
    throw new ApiError({
      message: deriveErrorMessage(payload, response),
      status: response.status,
      statusText: response.statusText,
      payload: payload ?? null,
      meta,
      response,
    });
  }

  return (payload as TPayload) ?? (null as TPayload);
};

export const fetchParsed = async <TPayload = unknown>(
  input: RequestTarget,
  init: FetchRequestInit = {},
): Promise<TPayload> => executeRequest<TPayload>(input, { ...init, parseMode: init.parseMode ?? 'auto' });

export const fetchJson = async <TPayload = unknown>(
  input: RequestTarget,
  init: FetchRequestInit = {},
): Promise<TPayload> => executeRequest<TPayload>(input, { ...init, parseMode: 'json' });

export const fetchText = async (
  input: RequestTarget,
  init: FetchRequestInit = {},
): Promise<string | null> => executeRequest<string | null>(input, { ...init, parseMode: 'text' });

export const fetchVoid = async (
  input: RequestTarget,
  init: FetchRequestInit = {},
): Promise<void> => {
  await executeRequest(input, { ...init, parseMode: 'none' });
};

