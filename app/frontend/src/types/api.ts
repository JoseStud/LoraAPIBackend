/**
 * Shared API helper types used by composables and services.
 */

/** Metadata describing the last HTTP response returned by an API call. */
export interface ApiResponseMeta {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  headers: Headers;
}

/** Function signature for transforming a fetch Response into typed data. */
export type ResponseParser<T> = (response: Response) => Promise<T>;

/** Optional configuration supplied when creating a useApi instance. */
export interface UseApiConfig<TData, TError> {
  parseResponse?: ResponseParser<TData>;
  parseError?: ResponseParser<TError>;
}

/** Options accepted by fetchData for overriding request/parse behaviour. */
export interface FetchDataOptions<TData, TError> extends UseApiConfig<TData, TError> {
  init?: RequestInit;
}

interface ApiErrorInit<TPayload> {
  message: string;
  status: number;
  statusText?: string;
  payload?: TPayload;
  meta: ApiResponseMeta;
  response?: Response;
  cause?: unknown;
}

/**
 * Normalised error thrown by the API composables.
 */
export class ApiError<TPayload = unknown> extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly payload?: TPayload;
  readonly meta: ApiResponseMeta;
  readonly response?: Response;

  constructor(init: ApiErrorInit<TPayload>) {
    super(init.message, init.cause ? { cause: init.cause } : undefined);
    this.name = 'ApiError';
    this.status = init.status;
    this.statusText = init.statusText ?? '';
    this.payload = init.payload;
    this.meta = init.meta;
    this.response = init.response;
  }
}

/** Structured result object returned by API composables. */
export interface ApiResult<TData = unknown, TError = unknown> {
  data: TData | null;
  error: ApiError<TError> | null;
  meta: ApiResponseMeta | null;
}
