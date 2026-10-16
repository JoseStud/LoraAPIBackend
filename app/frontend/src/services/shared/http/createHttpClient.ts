import { ApiError, type ApiResponseMeta, type ApiResult } from '@/types';
import { buildAuthenticatedHeaders, mergeHeaders } from '@/utils/httpAuth';

/**
 * The one HTTP client of the frontend. Every request (services, `useApi`, the backend clients)
 * goes through `createHttpClient`, so URL resolution, auth headers, retries, error
 * normalisation and tracing are defined here and nowhere else.
 *
 * Retry policy: only idempotent reads (`GET`, `HEAD`) are retried, up to
 * `DEFAULT_RETRY_ATTEMPTS` attempts in total, on 5xx responses and network failures.
 * 4xx responses are never retried, and neither is a request whose signal was aborted.
 */

const DEFAULT_CREDENTIALS: RequestCredentials = 'same-origin';
const RETRYABLE_METHOD_LIST = ['GET', 'HEAD'] as const;
const RETRYABLE_METHODS = new Set<string>(RETRYABLE_METHOD_LIST);
export const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 150;
const DEFAULT_RETRY_MAX_DELAY_MS = 1_500;

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

export interface HttpRetryContext {
  url: string;
  init: ApiRequestInit;
  attempt: number;
  error: unknown;
  response?: Response | null;
}

export interface RetryOptions {
  /** Total attempts, including the first. `1` disables retries. */
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Narrows the retried methods; anything outside `GET`/`HEAD` is ignored. */
  retryOnMethods?: string[];
  /** Statuses to retry instead of the default 5xx range. */
  retryOnStatuses?: number[];
  retryOnNetworkError?: boolean;
  /** Extra veto for a retry the policy would allow. Cannot enable retries the policy forbids. */
  shouldRetry?: (context: HttpRetryContext) => boolean;
}

export interface HttpTraceLogEntry {
  event: 'response' | 'error' | 'retry';
  method: string;
  url: string;
  status?: number;
  duration: number;
  attempt: number;
  nextAttempt?: number;
  delayMs?: number;
  error?: unknown;
}

export type HttpTraceOptions =
  | boolean
  | {
      enabled?: boolean;
      logger?: (entry: HttpTraceLogEntry) => void;
      console?: boolean;
    };

export interface HttpAuthOptions {
  /** When false, no API key header is added. Defaults to true. */
  enabled?: boolean;
  /** Extra headers sent with every request, below the per-request headers. */
  headers?: HeadersInit | (() => HeadersInit | null | undefined);
}

export interface CreateHttpClientConfig {
  baseURL?: string | (() => string | null | undefined);
  credentials?: RequestCredentials;
  fetch?: typeof fetch;
  auth?: HttpAuthOptions | false;
  retry?: RetryOptions;
  trace?: HttpTraceOptions;
}

export interface HttpClient {
  resolve: (path?: string) => string;
  request: <TPayload = unknown>(target: RequestTarget, init?: ApiRequestInit) => Promise<ApiRequestResult<TPayload>>;
  requestJson: <TPayload = unknown>(target: RequestTarget, init?: ApiRequestInit) => Promise<ApiResult<TPayload>>;
  getJson: <TPayload = unknown>(target: RequestTarget, init?: ApiRequestInit) => Promise<TPayload | null>;
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
  requestBlob: (target: RequestTarget, init?: RequestInit) => Promise<BlobResult>;
}

export type { ApiResult };

// ---------------------------------------------------------------------------
// URL resolution
// ---------------------------------------------------------------------------

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

type BaseUrlResolver = () => string | null;

const createBaseUrlResolver = (input?: CreateHttpClientConfig['baseURL']): BaseUrlResolver => {
  if (!input) {
    return () => null;
  }

  return () => {
    try {
      const resolved = typeof input === 'function' ? input() : input;
      if (typeof resolved !== 'string') {
        return null;
      }
      const trimmed = resolved.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[http] Failed to resolve base URL', error);
      }
      return null;
    }
  };
};

const resolveUrl = (target: RequestTarget, resolveBase: BaseUrlResolver): string => {
  if (typeof target === 'string') {
    const trimmed = target.trim();
    if (!trimmed) {
      const base = resolveBase();
      if (base) {
        return base;
      }
      throw new Error('Invalid request URL');
    }

    if (isAbsoluteUrl(trimmed)) {
      return trimmed;
    }

    const base = resolveBase();
    return base ? joinUrlSegments(base, trimmed) : trimmed;
  }

  if (typeof URL !== 'undefined' && target instanceof URL) {
    return target.toString();
  }

  if (typeof Request !== 'undefined' && target instanceof Request) {
    return target.url;
  }

  throw new Error('Invalid request URL');
};

// ---------------------------------------------------------------------------
// Response parsing and errors
// ---------------------------------------------------------------------------

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
      console.warn('[http] Failed to parse JSON response', error);
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
      console.warn('[http] Failed to read text response', error);
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

const parseResponsePayload = async (response: Response, mode: ResponseParseMode): Promise<unknown> => {
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

const firstNonEmptyString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string' && entry.trim());
    return typeof first === 'string' ? first : null;
  }
  return null;
};

const deriveErrorMessage = (payload: unknown, response: Response): string => {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const message =
      firstNonEmptyString(record.detail)
      ?? (typeof record.message === 'string' && record.message.trim() ? record.message : null)
      ?? firstNonEmptyString(record.errors);
    if (message) {
      return message;
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

export const isAbortError = (error: unknown): boolean => {
  if (!error) {
    return false;
  }
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (typeof error === 'object') {
    return (error as { name?: string }).name === 'AbortError';
  }
  return false;
};

const abortReason = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');

/** Wraps a network-level failure (no response) in an `ApiError` with status 0. */
const toNetworkError = (url: string, method: string, cause: unknown): ApiError => {
  const meta: ApiResponseMeta = {
    ok: false,
    status: 0,
    statusText: 'Network Error',
    headers: undefined,
    url,
  } satisfies ApiResponseMeta;

  return new ApiError({
    message: `Request failed (${method} ${url})`,
    status: 0,
    statusText: 'Network Error',
    payload: null,
    meta,
    cause,
  });
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const normaliseMethod = (method?: string): string => (method ?? 'GET').toUpperCase();

const sleep = async (delay: number): Promise<void> => {
  if (delay <= 0) {
    return;
  }
  await new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
};

const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();

interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  methods: Set<string>;
  statuses: number[] | null;
  retryOnNetworkError: boolean;
  veto?: (context: HttpRetryContext) => boolean;
}

const createRetryPolicy = (options: RetryOptions = {}): RetryPolicy => {
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
  const configuredMethods = (options.retryOnMethods ?? [])
    .map(normaliseMethod)
    .filter((method) => RETRYABLE_METHODS.has(method));

  return {
    attempts: Math.max(1, options.attempts ?? DEFAULT_RETRY_ATTEMPTS),
    baseDelayMs,
    maxDelayMs: Math.max(baseDelayMs, options.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS),
    methods: new Set(configuredMethods.length > 0 ? configuredMethods : RETRYABLE_METHOD_LIST),
    statuses: options.retryOnStatuses?.length ? options.retryOnStatuses : null,
    retryOnNetworkError: options.retryOnNetworkError ?? true,
    veto: options.shouldRetry,
  };
};

const shouldRetry = (policy: RetryPolicy, method: string, context: HttpRetryContext): boolean => {
  if (context.attempt >= policy.attempts || !policy.methods.has(method) || isAbortError(context.error)) {
    return false;
  }

  const retryable = context.response
    ? policy.statuses
      ? policy.statuses.includes(context.response.status)
      : context.response.status >= 500 && context.response.status < 600
    : policy.retryOnNetworkError;

  if (!retryable) {
    return false;
  }

  return policy.veto ? policy.veto(context) : true;
};

const computeDelay = (nextAttempt: number, policy: RetryPolicy): number => {
  const delay = policy.baseDelayMs * 2 ** Math.max(0, nextAttempt - 2);
  return Math.min(Math.max(0, delay), policy.maxDelayMs);
};

interface TraceConfig {
  enabled: boolean;
  logger?: (entry: HttpTraceLogEntry) => void;
  console: boolean;
}

const resolveTraceConfig = (trace?: HttpTraceOptions): TraceConfig => {
  if (trace == null || typeof trace === 'boolean') {
    return { enabled: trace ?? false, console: true };
  }

  return {
    enabled: trace.enabled ?? !!trace.logger,
    logger: trace.logger,
    console: trace.console ?? true,
  };
};

const emitTrace = (config: TraceConfig, entry: HttpTraceLogEntry): void => {
  if (!config.enabled) {
    return;
  }

  try {
    config.logger?.(entry);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[http] Trace logger failed', error);
    }
  }

  if (config.console) {
    const log = entry.event === 'error' ? console.error : entry.event === 'retry' ? console.warn : console.info;
    log('[http]', { ...entry, status: entry.status ?? null });
  }
};

const resolveAuthHeaders = (auth: HttpAuthOptions): HeadersInit | undefined => {
  const input = auth.headers;
  if (!input) {
    return undefined;
  }

  try {
    return (typeof input === 'function' ? input() : input) ?? undefined;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[http] Failed to resolve auth headers', error);
    }
    return undefined;
  }
};

const createJsonInit = (method: string, body: unknown, init: ApiRequestInit = {}): ApiRequestInit => {
  const headers = new Headers(init.headers ?? {});
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return {
    ...init,
    method,
    headers,
    body: isFormData ? body : JSON.stringify(body),
  } satisfies ApiRequestInit;
};

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const createHttpClient = (config: CreateHttpClientConfig = {}): HttpClient => {
  // Resolve the global fetch per request so long-lived clients pick up later replacements
  // (polyfills, instrumentation, test doubles) instead of the one present at creation time.
  const resolveFetch = (): typeof fetch => {
    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('Fetch API is not available');
    }
    return fetchImpl;
  };
  // Still fail fast at creation when no fetch implementation exists at all.
  resolveFetch();

  const resolveBase = createBaseUrlResolver(config.baseURL);
  const retryPolicy = createRetryPolicy(config.retry);
  const traceConfig = resolveTraceConfig(config.trace);
  const auth: HttpAuthOptions = config.auth === false ? { enabled: false } : { enabled: true, ...config.auth };
  const defaultCredentials = config.credentials ?? DEFAULT_CREDENTIALS;

  /** The single place where request headers (and the API key) are assembled. */
  const prepareInit = (init: ApiRequestInit): ApiRequestInit => {
    const headers = auth.enabled !== false
      ? buildAuthenticatedHeaders(resolveAuthHeaders(auth), init.headers)
      : mergeHeaders(resolveAuthHeaders(auth), init.headers);

    return {
      ...init,
      headers,
      credentials: init.credentials ?? defaultCredentials,
    } satisfies ApiRequestInit;
  };

  const request = async <TPayload>(
    target: RequestTarget,
    init: ApiRequestInit = {},
  ): Promise<ApiRequestResult<TPayload>> => {
    const preparedInit = prepareInit(init);
    const { parseMode = 'auto', ...requestInit } = preparedInit;
    const method = normaliseMethod(requestInit.method);
    const { signal } = requestInit;
    const url = resolveUrl(target, resolveBase);

    const retryOrThrow = async (
      attempt: number,
      startedAt: number,
      error: unknown,
      response: Response | undefined,
    ): Promise<ApiRequestResult<TPayload>> => {
      const duration = now() - startedAt;
      emitTrace(traceConfig, { event: 'error', method, url, status: response?.status, duration, attempt, error });

      // A request whose caller aborted it settles as aborted, even if a response arrived first.
      if (signal?.aborted) {
        throw abortReason(signal);
      }

      const context: HttpRetryContext = { url, init: preparedInit, attempt, error, response };
      if (!shouldRetry(retryPolicy, method, context)) {
        if (error instanceof ApiError || isAbortError(error)) {
          throw error;
        }
        throw toNetworkError(url, method, error);
      }

      const nextAttempt = attempt + 1;
      const delayMs = computeDelay(nextAttempt, retryPolicy);
      emitTrace(traceConfig, {
        event: 'retry',
        method,
        url,
        status: response?.status,
        duration,
        attempt,
        nextAttempt,
        delayMs,
        error,
      });
      await sleep(delayMs);
      return execute(nextAttempt);
    };

    const execute = async (attempt: number): Promise<ApiRequestResult<TPayload>> => {
      const startedAt = now();
      let response: Response;
      try {
        if (signal?.aborted) {
          throw abortReason(signal);
        }
        response = await resolveFetch()(url, requestInit);
      } catch (error) {
        return retryOrThrow(attempt, startedAt, error, undefined);
      }

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
        return retryOrThrow(attempt, startedAt, error, response);
      }

      emitTrace(traceConfig, {
        event: 'response',
        method,
        url,
        status: response.status,
        duration: now() - startedAt,
        attempt,
      });
      return { data: (payload as TPayload | null) ?? null, meta, response };
    };

    return execute(1);
  };

  const requestJson = async <TPayload>(
    target: RequestTarget,
    init: ApiRequestInit = {},
  ): Promise<ApiResult<TPayload>> => {
    const result = await request<TPayload>(target, { ...init, parseMode: 'json' });
    return { data: result.data, meta: result.meta };
  };

  return {
    resolve: (path?: string) => resolveUrl(path ?? '', resolveBase),
    request,
    requestJson,
    getJson: async <TPayload>(target: RequestTarget, init: ApiRequestInit = {}) => {
      const result = await requestJson<TPayload>(target, { ...init, method: normaliseMethod(init.method) });
      return result.data ?? null;
    },
    postJson: <TResponse, TBody>(target: RequestTarget, body: TBody, init: ApiRequestInit = {}) =>
      requestJson<TResponse>(target, createJsonInit('POST', body, init)),
    putJson: <TResponse, TBody>(target: RequestTarget, body: TBody, init: ApiRequestInit = {}) =>
      requestJson<TResponse>(target, createJsonInit('PUT', body, init)),
    patchJson: <TResponse, TBody>(target: RequestTarget, body: TBody, init: ApiRequestInit = {}) =>
      requestJson<TResponse>(target, createJsonInit('PATCH', body, init)),
    delete: <TResponse>(target: RequestTarget, init: ApiRequestInit = {}) =>
      requestJson<TResponse>(target, { ...init, method: 'DELETE' }),
    requestBlob: async (target: RequestTarget, init: RequestInit = {}): Promise<BlobResult> => {
      const result = await request<null>(target, { ...init, parseMode: 'none' });
      const blob = await result.response.blob();
      return { blob, response: result.response, meta: result.meta };
    },
  } satisfies HttpClient;
};
