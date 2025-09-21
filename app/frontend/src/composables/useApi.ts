import { MaybeRefOrGetter, Ref, ref, unref } from 'vue';

import type { ApiResponseMeta } from '@/types';
import { ApiError } from '@/types';

export type { ApiResponseMeta } from '@/types';
export { ApiError } from '@/types';

export function useApi<T = unknown, TError = unknown>(
  url: MaybeRefOrGetter<string>,
  defaultOptions: RequestInit = {},
) {
  const data = ref<T | null>(null) as Ref<T | null>;
  const error = ref<ApiError<TError> | unknown>(null);
  const isLoading = ref(false);
  const lastResponse = ref<ApiResponseMeta | null>(null);

  const applyState = ({
    data: nextData,
    error: nextError,
    meta,
  }: {
    data: T | null;
    error: ApiError<TError> | unknown | null;
    meta: ApiResponseMeta;
  }) => {
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

  const fetchData = async (init: RequestInit = {}) => {
    const targetUrl = resolveUrl();
    if (!targetUrl) {
      throw new Error('Invalid API URL');
    }

    isLoading.value = true;
    error.value = null;

    try {
      const response = await fetch(targetUrl, { credentials: 'same-origin', ...defaultOptions, ...init });
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
        applyState({ error: apiError, data: null, meta: metaInfo });
        throw apiError;
      }

      applyState({ data: (payload as T | null) ?? null, error: null, meta: metaInfo });
      return data.value;
    } catch (err) {
      if (!(err instanceof ApiError)) {
        const fallbackMeta: ApiResponseMeta = {
          ok: false,
          status: err instanceof Response ? err.status : 0,
          statusText: err instanceof Response ? err.statusText ?? '' : '',
          headers: err instanceof Response ? err.headers : undefined,
        };
        applyState({ data: null, error: err, meta: fallbackMeta });
      }
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  return { data, error, isLoading, fetchData, lastResponse };
}

export type UseApiReturn<T, TError = unknown> = ReturnType<typeof useApi<T, TError>>;
