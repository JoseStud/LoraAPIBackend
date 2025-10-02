import {
  createHttpClient as createCoreHttpClient,
  type ApiRequestInit,
  type ApiRequestResult,
  type ApiResult,
  type BlobResult,
  type HttpClientErrorEvent,
  type HttpClientHooks,
  type HttpClientResponseEvent,
  type HttpClientRetryEvent,
  type RequestTarget,
  type RetryOptions,
} from '@/services/httpClient';
import { ApiError, type ApiResponseMeta } from '@/types';
import { buildAuthenticatedHeaders } from '@/utils/httpAuth';

const IDEMPOTENT_METHOD_LIST = ['GET', 'HEAD'] as const;
const IDEMPOTENT_METHODS = new Set<string>(IDEMPOTENT_METHOD_LIST);
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 150;
const DEFAULT_RETRY_MAX_DELAY_MS = 1_500;

const normaliseMethod = (method?: string): string => (method ?? 'GET').toUpperCase();

const isFunction = <T>(value: T | (() => T)): value is () => T => typeof value === 'function';

const resolveHeaders = (input?: HeadersInit | (() => HeadersInit | null | undefined)):
  | HeadersInit
  | undefined => {
  if (!input) {
    return undefined;
  }

  try {
    const resolved = isFunction(input) ? input() : input;
    return resolved ?? undefined;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[http] Failed to resolve auth headers', error);
    }
    return undefined;
  }
};

const isAbortError = (error: unknown): boolean => {
  if (!error) {
    return false;
  }

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (typeof error === 'object') {
    const candidate = error as { name?: string };
    return candidate.name === 'AbortError';
  }

  return false;
};

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
  enabled?: boolean;
  headers?: HeadersInit | (() => HeadersInit | null | undefined);
}

export interface CreateHttpClientConfig {
  baseURL?: string | (() => string | null | undefined);
  auth?: HttpAuthOptions | false;
  retry?: RetryOptions;
  trace?: HttpTraceOptions;
}

export interface HttpClient {
  resolve: (path?: string) => string;
  request: <TPayload = unknown>(path: string, init?: ApiRequestInit) => Promise<ApiRequestResult<TPayload>>;
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

export type { ApiRequestInit, ApiRequestResult, ApiResult, BlobResult, RequestTarget };

interface TraceConfig {
  enabled: boolean;
  logger?: (entry: HttpTraceLogEntry) => void;
  console: boolean;
}

const resolveTraceConfig = (trace?: HttpTraceOptions): TraceConfig => {
  if (trace == null) {
    return { enabled: false, console: true } satisfies TraceConfig;
  }

  if (typeof trace === 'boolean') {
    return { enabled: trace, console: true } satisfies TraceConfig;
  }

  return {
    enabled: trace.enabled ?? !!trace.logger,
    logger: trace.logger,
    console: trace.console ?? true,
  } satisfies TraceConfig;
};

const emitTraceLog = (config: TraceConfig, entry: HttpTraceLogEntry): void => {
  if (!config.enabled) {
    return;
  }

  const payload: HttpTraceLogEntry = {
    event: entry.event,
    method: entry.method,
    url: entry.url,
    status: entry.status,
    duration: entry.duration,
    attempt: entry.attempt,
    nextAttempt: entry.nextAttempt,
    delayMs: entry.delayMs,
    error: entry.error,
  } satisfies HttpTraceLogEntry;

  try {
    config.logger?.(payload);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[http] Trace logger failed', error);
    }
  }

  if (config.console) {
    const method = entry.event === 'error' ? console.error : entry.event === 'retry' ? console.warn : console.info;
    method('[http]', {
      method: payload.method,
      url: payload.url,
      status: payload.status ?? null,
      duration: payload.duration,
      attempt: payload.attempt,
      event: payload.event,
      delayMs: payload.delayMs,
      nextAttempt: payload.nextAttempt,
      error: payload.error,
    });
  }
};

const normaliseRetryOptions = (options: RetryOptions | undefined): RetryOptions => {
  const attempts = Math.max(1, options?.attempts ?? DEFAULT_RETRY_ATTEMPTS);
  const baseDelayMs = options?.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const maxDelayMs = Math.max(baseDelayMs, options?.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS);
  const configuredMethods = options?.retryOnMethods?.map(normaliseMethod) ?? [];
  const retryOnMethods = configuredMethods.filter((method) => IDEMPOTENT_METHODS.has(method));

  const shouldRetry = options?.shouldRetry;

  return {
    ...options,
    attempts,
    baseDelayMs,
    maxDelayMs,
    retryOnMethods: retryOnMethods.length > 0 ? retryOnMethods : [...IDEMPOTENT_METHOD_LIST],
    retryOnNetworkError: options?.retryOnNetworkError ?? true,
    shouldRetry: (context) => {
      const method = normaliseMethod(context.init.method);
      if (!IDEMPOTENT_METHODS.has(method)) {
        return false;
      }
      return shouldRetry ? shouldRetry(context) : true;
    },
  } satisfies RetryOptions;
};

const resolveBaseUrl = (resolver?: string | (() => string | null | undefined)): (() => string | null) => {
  if (!resolver) {
    return () => null;
  }

  if (typeof resolver === 'string') {
    const trimmed = resolver.trim();
    return () => (trimmed.length > 0 ? trimmed : null);
  }

  return () => {
    try {
      const resolved = resolver();
      if (typeof resolved === 'string') {
        const trimmed = resolved.trim();
        return trimmed.length > 0 ? trimmed : null;
      }
      return resolved ?? null;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[http] Failed to resolve base URL', error);
      }
      return null;
    }
  };
};

const normaliseAuthConfig = (auth?: HttpAuthOptions | false): HttpAuthOptions => {
  if (auth === false) {
    return { enabled: false } satisfies HttpAuthOptions;
  }

  return {
    enabled: auth?.enabled ?? true,
    headers: auth?.headers,
  } satisfies HttpAuthOptions;
};

const createError = (
  url: string,
  init: ApiRequestInit,
  cause: unknown,
): ApiError => {
  if (cause instanceof ApiError) {
    return cause;
  }

  const method = normaliseMethod(init.method);
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

export const createHttpClient = (config: CreateHttpClientConfig = {}): HttpClient => {
  const traceConfig = resolveTraceConfig(config.trace);
  const authConfig = normaliseAuthConfig(config.auth);
  const baseUrlResolver = resolveBaseUrl(config.baseURL);
  const retryOptions = normaliseRetryOptions(config.retry);

  const hooks: HttpClientHooks = {
    onResponse: (event: HttpClientResponseEvent) => {
      emitTraceLog(traceConfig, {
        event: 'response',
        method: normaliseMethod(event.request.method),
        url: event.url,
        status: event.response.status,
        duration: event.durationMs,
        attempt: event.attempt,
      });
    },
    onError: (event: HttpClientErrorEvent) => {
      emitTraceLog(traceConfig, {
        event: 'error',
    method: normaliseMethod(event.request.method),
    url: event.url,
    status: event.response?.status,
        duration: event.durationMs,
        attempt: event.attempt,
        error: event.error,
      });
    },
    onRetry: (event: HttpClientRetryEvent) => {
      emitTraceLog(traceConfig, {
        event: 'retry',
        method: normaliseMethod(event.request.method),
        url: event.url,
        status: event.response?.status,
        duration: event.durationMs,
        attempt: event.attempt,
        nextAttempt: event.nextAttempt,
        delayMs: event.delayMs,
        error: event.error,
      });
    },
  } satisfies HttpClientHooks;

  const coreClient = createCoreHttpClient({
    baseUrl: baseUrlResolver,
    defaultInit: { credentials: 'same-origin' },
    retry: retryOptions,
    hooks,
  });

  const applyInit = (init: ApiRequestInit = {}): ApiRequestInit => {
    const headers = authConfig.enabled
      ? buildAuthenticatedHeaders(resolveHeaders(authConfig.headers), init.headers)
      : init.headers ?? undefined;

    const merged: ApiRequestInit = {
      ...init,
      headers,
      credentials: init.credentials ?? 'same-origin',
    } satisfies ApiRequestInit;

    return merged;
  };

  const run = async <T>(
    target: RequestTarget,
    init: ApiRequestInit,
    operation: () => Promise<T>,
  ): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      const url = coreClient.resolve(target);
      throw createError(url, init, error);
    }
  };

  const request = async <TPayload>(
    target: RequestTarget,
    init: ApiRequestInit = {},
  ): Promise<ApiRequestResult<TPayload>> => {
    const prepared = applyInit(init);
    return run(target, prepared, () => coreClient.request<TPayload>(target, prepared));
  };

  const requestJson = async <TPayload>(
    target: RequestTarget,
    init: ApiRequestInit = {},
  ): Promise<ApiResult<TPayload>> => {
    const prepared = applyInit(init);
    return run(target, prepared, () => coreClient.requestJson<TPayload>(target, prepared));
  };

  const getJson = async <TPayload>(
    target: RequestTarget,
    init: ApiRequestInit = {},
  ): Promise<TPayload | null> => {
    const prepared = applyInit({ ...init, method: normaliseMethod(init.method ?? 'GET') });
    const result = await run(target, prepared, () => coreClient.requestJson<TPayload>(target, prepared));
    return (result.data as TPayload | null) ?? null;
  };

  return {
    resolve: (path?: string) => coreClient.resolve(path ?? ''),
    request: <TPayload>(path: string, init: ApiRequestInit = {}) => request<TPayload>(path, init),
    requestJson: <TPayload>(path: string, init: ApiRequestInit = {}) => requestJson(path, init),
    getJson: <TPayload>(path: string, init: ApiRequestInit = {}) => getJson<TPayload>(path, init),
    postJson: <TResponse, TBody>(path: string, body: TBody, init: ApiRequestInit = {}) => {
      const prepared = applyInit(init);
      return run(path, prepared, () => coreClient.postJson<TResponse, TBody>(path, body, prepared));
    },
    putJson: <TResponse, TBody>(path: string, body: TBody, init: ApiRequestInit = {}) => {
      const prepared = applyInit(init);
      return run(path, prepared, () => coreClient.putJson<TResponse, TBody>(path, body, prepared));
    },
    patchJson: <TResponse, TBody>(path: string, body: TBody, init: ApiRequestInit = {}) => {
      const prepared = applyInit(init);
      return run(path, prepared, () => coreClient.patchJson<TResponse, TBody>(path, body, prepared));
    },
    delete: <TResponse>(path: string, init: ApiRequestInit = {}) => {
      const prepared = applyInit({ ...init, method: 'DELETE' });
      return run(path, prepared, () => coreClient.delete<TResponse>(path, prepared));
    },
    requestBlob: (path: string, init: RequestInit = {}) => {
      const prepared = applyInit(init as ApiRequestInit);
      return run(path, prepared, () => coreClient.requestBlob(path, prepared));
    },
  } satisfies HttpClient;
};
