import { ApiError, type ApiResponseMeta, type ApiResult } from '@/types';
import { buildAuthenticatedHeaders } from '@/utils/httpAuth';

const DEFAULT_CREDENTIALS: RequestCredentials = 'same-origin';
const DEFAULT_RETRY_METHODS = ['GET', 'HEAD', 'OPTIONS'];
const DEFAULT_RETRY_ATTEMPTS = 1;
const DEFAULT_RETRY_BASE_DELAY = 150;
const DEFAULT_RETRY_MAX_DELAY = 1_500;

const isAbsoluteUrl = (value: string): boolean => /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');
const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, '');

const splitPathSuffix = (input: string): { pathname: string; suffix: string } => {
  const match = input.match(/^([^?#]*)(.*)$/);
  return { pathname: match?.[1] ?? '', suffix: match?.[2] ?? '' };
};

const joinUrlSegments = (base: string, path: string): string => {
  const { pathname, suffix } = splitPathSuffix(path);
  const normalisedPath = trimLeadingSlash(pathname);

  if (!base) {
    const candidate = normalisedPath || pathname;
    return (candidate ?? '') + suffix;
  }

  if (isAbsoluteUrl(base)) {
    const prefix = trimTrailingSlash(base);
    const combined = normalisedPath ? `${prefix}/${normalisedPath}` : prefix;
    return `${combined}${suffix}`;
  }

  const trimmedBase = trimTrailingSlash(base);
  const rootedBase = trimmedBase.length > 0
    ? trimmedBase.startsWith('/')
      ? trimmedBase
      : `/${trimLeadingSlash(trimmedBase)}`
    : '';

  if (!normalisedPath) {
    return rootedBase ? `${rootedBase}${suffix}` : suffix || rootedBase || '';
  }

  const combined = `${rootedBase}/${normalisedPath}`.replace(/\/{2,}/g, '/');
  return `${combined}${suffix}`;
};

const now = (): number => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const sleep = async (delay: number): Promise<void> => {
  if (delay <= 0) {
    return;
  }
  await new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
};

const isAbortError = (error: unknown): boolean => {
  if (!error) {
    return false;
  }
  if (error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (typeof error === 'object') {
    const candidate = error as { name?: string };
    return candidate.name === 'AbortError';
  }
  return false;
};

export type RequestTarget = Parameters<typeof fetch>[0];

export type ResponseParseMode = 'auto' | 'json' | 'text' | 'none';

export interface ApiRequestInit extends RequestInit {
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

export interface HttpClientRequestEvent {
  url: string;
  request: RequestInit;
  attempt: number;
  startedAt: number;
}

export interface HttpClientResponseEvent extends HttpClientRequestEvent {
  response: Response;
  durationMs: number;
}

export interface HttpClientErrorEvent extends HttpClientRequestEvent {
  error: unknown;
  durationMs: number;
  response?: Response | null;
}

export interface HttpClientRetryEvent extends HttpClientErrorEvent {
  nextAttempt: number;
  delayMs: number;
}

export interface HttpRetryContext {
  url: string;
  init: ApiRequestInit;
  attempt: number;
  error: unknown;
  response?: Response | null;
}

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryOnMethods?: string[];
  retryOnStatuses?: number[];
  retryOnNetworkError?: boolean;
  shouldRetry?: (context: HttpRetryContext) => boolean;
}

export interface HttpClientHooks {
  onRequest?: (event: HttpClientRequestEvent) => void;
  onResponse?: (event: HttpClientResponseEvent) => void;
  onError?: (event: HttpClientErrorEvent) => void;
  onRetry?: (event: HttpClientRetryEvent) => void;
}

export type HttpClientTracePhase = 'request' | 'response' | 'error' | 'retry';

export interface HttpClientTraceEvent {
  phase: HttpClientTracePhase;
  url: string;
  method: string;
  attempt: number;
  durationMs?: number;
  status?: number;
  delayMs?: number;
  error?: unknown;
}

export interface HttpClientOptions {
  baseUrl?: string | (() => string | null | undefined);
  credentials?: RequestCredentials;
  defaultInit?: ApiRequestInit;
  fetch?: typeof fetch;
  hooks?: HttpClientHooks;
  retry?: RetryOptions;
  trace?: boolean;
  logger?: (event: HttpClientTraceEvent) => void;
}

export interface HttpClient {
  resolve: (target?: RequestTarget) => string;
  request: <TPayload = unknown>(target: RequestTarget, init?: ApiRequestInit) => Promise<ApiRequestResult<TPayload>>;
  requestJson: <TPayload = unknown>(target: RequestTarget, init?: ApiRequestInit) => Promise<ApiResult<TPayload>>;
  getJson: <TPayload = unknown>(target: RequestTarget, init?: ApiRequestInit) => Promise<ApiResult<TPayload>>;
  postJson: <TResponse = unknown, TBody = unknown>(
    target: RequestTarget,
    body: TBody,
    init?: ApiRequestInit,
  ) => Promise<ApiResult<TResponse>>;
  putJson: <TResponse = unknown, TBody = unknown>(
    target: RequestTarget,
    body: TBody,
    init?: ApiRequestInit,
  ) => Promise<ApiResult<TResponse>>;
  patchJson: <TResponse = unknown, TBody = unknown>(
    target: RequestTarget,
    body: TBody,
    init?: ApiRequestInit,
  ) => Promise<ApiResult<TResponse>>;
  delete: <TResponse = unknown>(target: RequestTarget, init?: ApiRequestInit) => Promise<ApiResult<TResponse>>;
  fetchParsed: <TPayload = unknown>(target: RequestTarget, init?: ApiRequestInit) => Promise<TPayload>;
  fetchJson: <TPayload = unknown>(target: RequestTarget, init?: ApiRequestInit) => Promise<TPayload>;
  fetchText: (target: RequestTarget, init?: ApiRequestInit) => Promise<string | null>;
  fetchVoid: (target: RequestTarget, init?: ApiRequestInit) => Promise<void>;
  requestBlob: (target: RequestTarget, init?: RequestInit) => Promise<BlobResult>;
}

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
      console.warn('[httpClient] Failed to parse JSON response', error);
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
      console.warn('[httpClient] Failed to read text response', error);
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
  const contentType = typeof response.headers?.get === 'function' ? response.headers.get('content-type') ?? '' : '';
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

const normaliseMethod = (method?: string): string => {
  if (!method) {
    return 'GET';
  }
  return method.toUpperCase();
};

const computeDelay = (attempt: number, baseDelay: number, maxDelay: number): number => {
  const delay = baseDelay * 2 ** Math.max(0, attempt - 2);
  return Math.min(Math.max(0, delay), maxDelay);
};

const resolveBaseUrl = (resolver?: string | (() => string | null | undefined)): string | null => {
  if (!resolver) {
    return null;
  }

  try {
    const resolved = typeof resolver === 'function' ? resolver() : resolver;
    if (!resolved) {
      return null;
    }
    const trimmed = resolved.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[httpClient] Failed to resolve base URL', error);
    }
    return null;
  }
};

const resolveUrl = (target: RequestTarget, baseResolver?: string | (() => string | null | undefined)): string => {
  if (typeof target === 'string') {
    const trimmed = target.trim();
    if (!trimmed) {
      const base = resolveBaseUrl(baseResolver);
      if (base) {
        return base;
      }
      throw new Error('Invalid request URL');
    }

    if (isAbsoluteUrl(trimmed)) {
      return trimmed;
    }

    const base = resolveBaseUrl(baseResolver);
    if (!base) {
      return trimmed;
    }

    try {
      return joinUrlSegments(base, trimmed);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[httpClient] Failed to resolve request URL', error);
      }
      throw new Error('Invalid request URL');
    }
  }

  if (typeof URL !== 'undefined' && target instanceof URL) {
    return target.toString();
  }

  if (typeof Request !== 'undefined' && target instanceof Request) {
    return target.url;
  }

  throw new Error('Invalid request URL');
};

const mergeRequestInit = (
  baseInit: ApiRequestInit | undefined,
  overrideInit: ApiRequestInit | undefined,
  credentialsFallback: RequestCredentials,
): ApiRequestInit => {
  const headers = buildAuthenticatedHeaders(baseInit?.headers, overrideInit?.headers);
  const credentials = overrideInit?.credentials ?? baseInit?.credentials ?? credentialsFallback;
  const signal = overrideInit?.signal ?? baseInit?.signal;
  const parseMode = overrideInit?.parseMode ?? baseInit?.parseMode;

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

const shouldRetryByStatus = (status: number, statuses?: number[]): boolean => {
  if (Array.isArray(statuses) && statuses.length > 0) {
    return statuses.includes(status);
  }
  return status >= 500 && status < 600;
};

export const ensureData = <T>(result: ApiResult<T>): T => {
  if (result.data == null) {
    throw new Error('Request did not return a response body');
  }
  return result.data;
};

export const createHttpClient = (options: HttpClientOptions = {}): HttpClient => {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch API is not available');
  }

  const defaultInit = options.defaultInit;
  const credentialsFallback = options.credentials ?? DEFAULT_CREDENTIALS;
  const hooks = options.hooks ?? {};

  const retryOptions = options.retry ?? {};
  const maxAttempts = Math.max(1, retryOptions.attempts ?? DEFAULT_RETRY_ATTEMPTS);
  const retryOnMethods = (retryOptions.retryOnMethods ?? DEFAULT_RETRY_METHODS).map(normaliseMethod);
  const retryOnNetworkError = retryOptions.retryOnNetworkError ?? true;
  const baseDelay = Math.max(0, retryOptions.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY);
  const maxDelay = Math.max(baseDelay, retryOptions.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY);

  const shouldTrace = options.trace ?? false;
  const logTrace = (event: HttpClientTraceEvent) => {
    try {
      options.logger?.(event);
      if (shouldTrace) {
        console.debug('[httpClient]', event);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[httpClient] Failed to emit trace event', error);
      }
    }
  };

  const emitRequest = (event: HttpClientRequestEvent) => {
    hooks.onRequest?.(event);
    logTrace({
      phase: 'request',
      url: event.url,
      method: normaliseMethod(event.request.method),
      attempt: event.attempt,
    });
  };

  const emitResponse = (event: HttpClientResponseEvent) => {
    hooks.onResponse?.(event);
    logTrace({
      phase: 'response',
      url: event.url,
      method: normaliseMethod(event.request.method),
      attempt: event.attempt,
      status: event.response.status,
      durationMs: event.durationMs,
    });
  };

  const emitError = (event: HttpClientErrorEvent) => {
    hooks.onError?.(event);
    logTrace({
      phase: 'error',
      url: event.url,
      method: normaliseMethod(event.request.method),
      attempt: event.attempt,
      status: event.response?.status,
      durationMs: event.durationMs,
      error: event.error,
    });
  };

  const emitRetry = (event: HttpClientRetryEvent) => {
    hooks.onRetry?.(event);
    logTrace({
      phase: 'retry',
      url: event.url,
      method: normaliseMethod(event.request.method),
      attempt: event.nextAttempt,
      status: event.response?.status,
      durationMs: event.durationMs,
      delayMs: event.delayMs,
      error: event.error,
    });
  };

  const shouldRetry = (context: HttpRetryContext, method: string): boolean => {
    if (maxAttempts <= 1) {
      return false;
    }

    if (!retryOnMethods.includes(method)) {
      return false;
    }

    if (retryOptions.shouldRetry) {
      return retryOptions.shouldRetry(context);
    }

    if (context.response) {
      return shouldRetryByStatus(context.response.status, retryOptions.retryOnStatuses);
    }

    if (!context.response && retryOnNetworkError && context.error && !isAbortError(context.error)) {
      return true;
    }

    return false;
  };

  const request = async <TPayload>(
    target: RequestTarget,
    init: ApiRequestInit = {},
  ): Promise<ApiRequestResult<TPayload>> => {
    const mergedInit = mergeRequestInit(defaultInit, init, credentialsFallback);
    const { parseMode = 'auto', ...rest } = mergedInit;
    const requestInit = { ...rest } as RequestInit;
    const method = normaliseMethod(requestInit.method);
    const url = resolveUrl(target, options.baseUrl);

    const execute = async (attempt: number): Promise<ApiRequestResult<TPayload>> => {
      const startedAt = now();
      emitRequest({ url, request: requestInit, attempt, startedAt });

      try {
        const response = await fetchImpl(url, requestInit);
        const meta = toResponseMeta(response);
        const payload = await parseResponsePayload(response, parseMode);

        if (!response.ok) {
          const error = new ApiError<TPayload>({
            message: deriveErrorMessage(payload, response),
            status: response.status,
            statusText: response.statusText,
            payload: (payload as TPayload | null) ?? null,
            meta,
            response,
          });
          const durationMs = now() - startedAt;
          emitError({ url, request: requestInit, attempt, startedAt, durationMs, error, response });

          const retryContext: HttpRetryContext = { url, init: mergedInit, attempt, error, response };
          if (attempt < maxAttempts && shouldRetry(retryContext, method)) {
            const nextAttempt = attempt + 1;
            const delayMs = computeDelay(nextAttempt, baseDelay, maxDelay);
            emitRetry({
              url,
              request: requestInit,
              attempt,
              startedAt,
              durationMs,
              error,
              response,
              nextAttempt,
              delayMs,
            });
            await sleep(delayMs);
            return execute(nextAttempt);
          }

          throw error;
        }

        const durationMs = now() - startedAt;
        emitResponse({ url, request: requestInit, attempt, startedAt, response, durationMs });
        return {
          data: (payload as TPayload | null) ?? null,
          meta,
          response,
        } satisfies ApiRequestResult<TPayload>;
      } catch (error) {
        if (error instanceof ApiError) {
          throw error;
        }

        const durationMs = now() - startedAt;
        emitError({ url, request: requestInit, attempt, startedAt, durationMs, error, response: undefined });

        const retryContext: HttpRetryContext = { url, init: mergedInit, attempt, error, response: undefined };
        if (attempt < maxAttempts && shouldRetry(retryContext, method)) {
          const nextAttempt = attempt + 1;
          const delayMs = computeDelay(nextAttempt, baseDelay, maxDelay);
          emitRetry({
            url,
            request: requestInit,
            attempt,
            startedAt,
            durationMs,
            error,
            response: undefined,
            nextAttempt,
            delayMs,
          });
          await sleep(delayMs);
          return execute(nextAttempt);
        }

        throw error;
      }
    };

    return execute(1);
  };

  const requestJson = async <TPayload>(
    target: RequestTarget,
    init: ApiRequestInit = {},
  ): Promise<ApiResult<TPayload>> => {
    const result = await request<TPayload>(target, { ...init, parseMode: 'json' });
    return { data: result.data, meta: result.meta } satisfies ApiResult<TPayload>;
  };

  const fetchParsed = async <TPayload>(target: RequestTarget, init: ApiRequestInit = {}): Promise<TPayload> => {
    const result = await request<TPayload>(target, init);
    return (result.data as TPayload) ?? (null as TPayload);
  };

  const fetchJson = async <TPayload>(target: RequestTarget, init: ApiRequestInit = {}): Promise<TPayload> => {
    const result = await request<TPayload>(target, { ...init, parseMode: 'json' });
    return (result.data as TPayload) ?? (null as TPayload);
  };

  const fetchText = async (target: RequestTarget, init: ApiRequestInit = {}): Promise<string | null> => {
    const result = await request<string | null>(target, { ...init, parseMode: 'text' });
    return result.data ?? null;
  };

  const fetchVoid = async (target: RequestTarget, init: ApiRequestInit = {}): Promise<void> => {
    await request(target, { ...init, parseMode: 'none' });
  };

  const resolve = (target: RequestTarget = ''): string => resolveUrl(target, options.baseUrl);

  return {
    resolve,
    request,
    requestJson,
    getJson: <TPayload>(target: RequestTarget, init: ApiRequestInit = {}) =>
      requestJson<TPayload>(target, { ...init, method: init.method ?? 'GET' }),
    postJson: <TResponse, TBody>(target: RequestTarget, body: TBody, init: ApiRequestInit = {}) =>
      requestJson<TResponse>(target, createJsonInit('POST', body, init)),
    putJson: <TResponse, TBody>(target: RequestTarget, body: TBody, init: ApiRequestInit = {}) =>
      requestJson<TResponse>(target, createJsonInit('PUT', body, init)),
    patchJson: <TResponse, TBody>(target: RequestTarget, body: TBody, init: ApiRequestInit = {}) =>
      requestJson<TResponse>(target, createJsonInit('PATCH', body, init)),
    delete: <TResponse>(target: RequestTarget, init: ApiRequestInit = {}) =>
      requestJson<TResponse>(target, { ...init, method: 'DELETE' }),
    fetchParsed,
    fetchJson,
    fetchText,
    fetchVoid,
    requestBlob: async (target: RequestTarget, init: RequestInit = {}): Promise<BlobResult> => {
      const result = await request<null>(target, { ...init, parseMode: 'none' });
      const blob = await result.response.blob();
      return { blob, response: result.response, meta: result.meta } satisfies BlobResult;
    },
  } satisfies HttpClient;
};

const ensureHeaders = (init?: HeadersInit): Headers => {
  return new Headers(init ?? {});
};

const createJsonInit = (method: string, body: unknown, options: ApiRequestInit = {}): ApiRequestInit => {
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
  } satisfies ApiRequestInit;
};
