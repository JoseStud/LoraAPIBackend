import { ref, unref } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';

import type { ApiResult, ApiResponseMeta, FetchDataOptions, UseApiConfig } from '@/types/api';
import { ApiError } from '@/types/api';

const parseJsonOrText = async <TPayload>(response: Response): Promise<TPayload> => {
  const contentType = response.headers?.get?.('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('json')) {
    return (await response.json()) as TPayload;
  }
  const text = await response.text();
  return text as unknown as TPayload;
};

const extractDetailString = (payload: unknown): string | undefined => {
  if (payload == null) {
    return undefined;
  }
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const extracted = extractDetailString(entry);
      if (extracted) {
        return extracted;
      }
    }
    return undefined;
  }
  if (typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const detailLike = record.detail ?? record.message ?? record.error ?? record.errors;
    if (typeof detailLike === 'string') {
      const trimmed = detailLike.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
    if (Array.isArray(detailLike)) {
      return extractDetailString(detailLike);
    }
  }
  return undefined;
};

const deriveErrorMessage = (payload: unknown, response: Response): string => {
  const extracted = extractDetailString(payload);
  if (extracted) {
    return extracted;
  }
  const statusText = response.statusText?.trim?.();
  if (statusText) {
    return statusText;
  }
  return `Request failed with status ${response.status}`;
};

const createMetaFromResponse = (response: Response): ApiResponseMeta => ({
  ok: response.ok,
  status: response.status,
  statusText: response.statusText ?? '',
  url: response.url ?? '',
  headers: response.headers,
});

const isFetchOptions = <TData, TError>(value: unknown): value is FetchDataOptions<TData, TError> => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'parseResponse' in value || 'parseError' in value || 'init' in value;
};

const normalizeOptions = <TData, TError>(
  arg?: RequestInit | FetchDataOptions<TData, TError>,
): FetchDataOptions<TData, TError> => {
  if (!arg) {
    return {};
  }
  if (isFetchOptions<TData, TError>(arg)) {
    return arg;
  }
  return { init: arg };
};

const resolveUrlValue = (url: MaybeRefOrGetter<string>): string => {
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

const fallbackMeta = (url: string, overrides: Partial<ApiResponseMeta> = {}): ApiResponseMeta => ({
  ok: overrides.ok ?? false,
  status: overrides.status ?? 0,
  statusText: overrides.statusText ?? '',
  url: overrides.url ?? url,
  headers: overrides.headers ?? new Headers(),
});

/**
 * Typed wrapper around the Fetch API that exposes reactive state and helpers.
 *
 * @example Basic JSON usage
 * ```ts
 * import type { AdapterListResponse } from '@/types';
 *
 * const { data, fetchData } = useApi<AdapterListResponse>('/api/v1/adapters');
 * await fetchData();
 * console.log(data.value?.items.length);
 * ```
 *
 * @example Custom parser for non-JSON payloads
 * ```ts
 * const { fetchData } = useApi<Blob>('/api/v1/reports/latest', {}, {
 *   parseResponse: (response) => response.blob(),
 * });
 * const reportBlob = await fetchData();
 * ```
 */
export function useApi<TData, TError = unknown>(
  url: MaybeRefOrGetter<string>,
  defaultOptions: RequestInit = {},
  config: UseApiConfig<TData, TError> = {},
): UseApiReturn<TData, TError> {
  const result = ref<ApiResult<TData, TError> | null>(null);
  const isLoading = ref(false);
  const data = ref<TData | null>(null);
  const error = ref<ApiError<TError> | null>(null);
  const meta = ref<ApiResponseMeta | null>(null);

  const applyState = (patch: Partial<ApiResult<TData, TError>>) => {
    const current: ApiResult<TData, TError> = {
      data: data.value,
      error: error.value,
      meta: meta.value,
    };

    const dataValue =
      Object.prototype.hasOwnProperty.call(patch, 'data')
        ? ((patch.data ?? null) as TData | null)
        : current.data ?? null;
    const errorValue =
      Object.prototype.hasOwnProperty.call(patch, 'error')
        ? ((patch.error ?? null) as ApiError<TError> | null)
        : current.error ?? null;
    const metaValue =
      Object.prototype.hasOwnProperty.call(patch, 'meta')
        ? ((patch.meta ?? null) as ApiResponseMeta | null)
        : current.meta ?? null;

    data.value = dataValue;
    error.value = errorValue;
    meta.value = metaValue;
    result.value = {
      data: data.value,
      error: error.value,
      meta: meta.value,
    };
  };

  const fetchData = async (
    arg?: RequestInit | FetchDataOptions<TData, TError>,
  ): Promise<TData> => {
    const targetUrl = resolveUrlValue(url);
    if (!targetUrl) {
      throw new Error('Invalid API URL');
    }

    isLoading.value = true;
    applyState({ error: null });

    const options = normalizeOptions(arg);
    const parseResponse = options.parseResponse ?? config.parseResponse ?? ((response: Response) => parseJsonOrText<TData>(response));
    const parseError = options.parseError ?? config.parseError ?? ((response: Response) => parseJsonOrText<TError>(response));

    try {
      const response = await fetch(targetUrl, {
        credentials: 'same-origin',
        ...defaultOptions,
        ...options.init,
      });

      const metaInfo = createMetaFromResponse(response);
      applyState({ meta: metaInfo });

      if (!response.ok) {
        let payload: TError | undefined;
        try {
          payload = await parseError(response);
        } catch (parseErr) {
          if (import.meta.env.DEV) {
            console.warn('Failed to parse API error payload', parseErr);
          }
        }

        const apiError = new ApiError<TError>({
          message: deriveErrorMessage(payload, response),
          status: response.status,
          statusText: response.statusText,
          payload,
          meta: metaInfo,
          response,
        });
        applyState({ error: apiError, data: null, meta: metaInfo });
        throw apiError;
      }

      const parsed = await parseResponse(response);
      applyState({ data: parsed, error: null });
      return parsed;
    } catch (err) {
      if (err instanceof ApiError) {
        if (!meta.value) {
          applyState({ meta: err.meta });
        }
        applyState({ error: err, data: null });
        throw err;
      }

      const responseLike = err instanceof Response ? err : undefined;
      const metaInfo = responseLike
        ? createMetaFromResponse(responseLike)
        : meta.value ?? fallbackMeta(targetUrl);

      const message = err instanceof Error ? err.message : 'Unknown error';
      const apiError = new ApiError<TError>({
        message: message || 'Network error',
        status: metaInfo.status,
        statusText: metaInfo.statusText,
        meta: metaInfo,
        response: responseLike,
        cause: err instanceof Error ? err : undefined,
      });

      applyState({ meta: metaInfo, error: apiError, data: null });
      throw apiError;
    } finally {
      isLoading.value = false;
    }
  };

  return {
    data,
    error,
    isLoading,
    fetchData,
    meta,
    lastResponse: meta,
    result,
  } as UseApiReturn<TData, TError>;
}

export interface UseApiReturn<TData, TError = unknown> {
  data: Ref<TData | null>;
  error: Ref<ApiError<TError> | null>;
  isLoading: Ref<boolean>;
  fetchData: (arg?: RequestInit | FetchDataOptions<TData, TError>) => Promise<TData>;
  meta: Ref<ApiResponseMeta | null>;
  lastResponse: Ref<ApiResponseMeta | null>;
  result: Ref<ApiResult<TData, TError> | null>;
}
