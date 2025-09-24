import { MaybeRefOrGetter, Ref, ref, unref } from 'vue';

import type { ApiResponseMeta } from '@/types';
import { ApiError } from '@/types';
import { buildAuthenticatedHeaders } from '@/utils/httpAuth';

export type { ApiResponseMeta } from '@/types';
export { ApiError } from '@/types';

const isAbortError = (error: unknown): boolean => {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  return error instanceof Error && error.name === 'AbortError';
};

export function useApi<T = unknown, TError = unknown>(
  url: MaybeRefOrGetter<string>,
  defaultOptions: RequestInit = {},
) {
  const data = ref<T | null>(null) as Ref<T | null>;
  const error = ref<ApiError<TError> | unknown>(null);
  const isLoading = ref(false);
  const lastResponse = ref<ApiResponseMeta | null>(null);
  const activeRequestId = ref(0);
  const activeController = ref<AbortController | null>(null);

  const applyState = (
    requestId: number,
    {
      data: nextData,
      error: nextError,
      meta,
    }: {
      data: T | null;
      error: ApiError<TError> | unknown | null;
      meta: ApiResponseMeta;
    },
  ) => {
    if (requestId !== activeRequestId.value) {
      return;
    }

    data.value = nextData;
    error.value = nextError;
    lastResponse.value = meta;
  };

  const readResponsePayload = async (response: Response): Promise<unknown> => {
    const contentType = typeof response.headers?.get === 'function'
      ? response.headers.get('content-type') ?? ''
      : '';
    const canParseJson = typeof response.json === 'function';
    const canReadText = typeof response.text === 'function';

    if (contentType.includes('application/json') || (!contentType && canParseJson)) {
      try {
        return await response.json();
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('Failed to parse JSON response', err);
        }
        return null;
      }
    }

    if (canReadText) {
      try {
        return await response.text();
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('Failed to read text response', err);
        }
        return null;
      }
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

  const resolveUrl = (): string => {
    try {
      const resolved = typeof url === 'function' ? (url as () => string)() : unref(url);
      return typeof resolved === 'string' ? resolved : '';
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to resolve API URL', err);
      }
      return '';
    }
  };

  const cancelActiveRequest = () => {
    if (activeController.value) {
      activeController.value.abort();
      activeController.value = null;
    }
  };

  const fetchData = async (init: RequestInit = {}) => {
    const targetUrl = resolveUrl();
    if (!targetUrl) {
      throw new Error('Invalid API URL');
    }

    const requestId = activeRequestId.value + 1;
    activeRequestId.value = requestId;

    isLoading.value = true;
    error.value = null;

    const controller = new AbortController();
    cancelActiveRequest();
    activeController.value = controller;

    try {
      const signal = init.signal ?? defaultOptions.signal ?? controller.signal;
      const headers = buildAuthenticatedHeaders(
        defaultOptions.headers,
        init.headers,
      );

      const requestInit: RequestInit = {
        credentials: 'same-origin',
        ...defaultOptions,
        ...init,
        headers,
        signal,
      };

      const response = await fetch(targetUrl, requestInit);
      const metaInfo: ApiResponseMeta = {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        url: response.url,
      };

      const payload = await readResponsePayload(response);

      if (!response.ok) {
        const apiError = new ApiError<TError>({
          message: deriveErrorMessage(payload, response),
          status: response.status,
          statusText: response.statusText,
          payload: (payload as TError) ?? null,
          meta: metaInfo,
          response,
        });
        applyState(requestId, { error: apiError, data: null, meta: metaInfo });
        throw apiError;
      }

      applyState(requestId, { data: (payload as T | null) ?? null, error: null, meta: metaInfo });
      return data.value;
    } catch (err) {
      if (isAbortError(err)) {
        return data.value;
      }
      if (!(err instanceof ApiError)) {
        const fallbackMeta: ApiResponseMeta = {
          ok: false,
          status: err instanceof Response ? err.status : 0,
          statusText: err instanceof Response ? err.statusText ?? '' : '',
          headers: err instanceof Response ? err.headers : undefined,
        };
        applyState(requestId, { data: null, error: err, meta: fallbackMeta });
      }
      throw err;
    } finally {
      if (requestId === activeRequestId.value) {
        if (activeController.value === controller) {
          activeController.value = null;
        }
        isLoading.value = false;
      }
    }
  };

  return { data, error, isLoading, fetchData, lastResponse, cancelActiveRequest };
}

export type UseApiReturn<T, TError = unknown> = ReturnType<typeof useApi<T, TError>>;
