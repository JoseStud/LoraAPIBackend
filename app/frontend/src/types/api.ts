/**
 * Shared API helper types used by composables and services.
 */

/** Metadata describing the last HTTP response returned by an API call. */
export interface ApiResponseMeta {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: Headers;
  url?: string;
}

/** Internal constructor contract for {@link ApiError}. */
export interface ApiErrorInit<TPayload> {
  message: string;
  status: number;
  statusText?: string;
  payload?: TPayload | null;
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
  readonly payload: TPayload | null;
  readonly meta: ApiResponseMeta;
  readonly response?: Response;

  constructor(init: ApiErrorInit<TPayload>) {
    super(init.message, init.cause ? { cause: init.cause } : undefined);
    this.name = 'ApiError';
    this.status = init.status;
    this.statusText = init.statusText ?? '';
    this.payload = init.payload ?? null;
    this.meta = init.meta;
    this.response = init.response;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Minimal snapshot of the API composable state used in pure helpers.
 */
export interface ApiResultSnapshot<TData = unknown, TError = unknown> {
  data: TData | null;
  error: ApiError<TError> | unknown | null;
  meta: ApiResponseMeta | null;
}

/** Structured result object returned by legacy helpers. */
export interface ApiResult<TData = unknown> {
  data: TData | null;
  meta: ApiResponseMeta;
}
