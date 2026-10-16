import { MaybeRefOrGetter, Ref, getCurrentScope, onScopeDispose, ref, unref } from 'vue';

import type { ApiResponseMeta } from '@/types';
import { ApiError } from '@/types';
import { mergeHeaders } from '@/utils/httpAuth';
import { isAbortError, performRequest, type ApiRequestInit } from '@/services/shared/http';

export type { ApiResponseMeta } from '@/types';
export { ApiError } from '@/types';

export function useApi<T = unknown, TError = unknown>(
  url: MaybeRefOrGetter<string>,
  defaultOptions: ApiRequestInit = {},
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
    const controller = activeController.value;
    if (controller) {
      activeController.value = null;
      controller.abort();
    }
  };

  if (getCurrentScope()) {
    onScopeDispose(cancelActiveRequest);
  }

  const fetchData = async (init: ApiRequestInit = {}) => {
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
      // The shared HTTP client adds the API key; only the caller's headers are merged here.
      const headers = mergeHeaders(defaultOptions.headers, init.headers);

      const requestInit: ApiRequestInit = {
        credentials: 'same-origin',
        ...defaultOptions,
        ...init,
        headers,
        signal,
      };

      const result = await performRequest<T>(targetUrl, requestInit);

      applyState(requestId, { data: result.data, error: null, meta: result.meta });
      return data.value;
    } catch (err) {
      if (isAbortError(err)) {
        return data.value;
      }
      if (err instanceof ApiError) {
        applyState(requestId, { data: null, error: err, meta: err.meta });
      } else {
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
