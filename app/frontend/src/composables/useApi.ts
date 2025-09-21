import { MaybeRefOrGetter, Ref, ref, unref } from 'vue';

interface ApiResponseMeta {
  ok: boolean;
  status: number;
  headers?: Headers;
}

export function useApi<T = unknown>(url: MaybeRefOrGetter<string>, defaultOptions: RequestInit = {}) {
  const data = ref<T | null>(null) as Ref<T | null>;
  const error = ref<unknown>(null);
  const isLoading = ref(false);
  const lastResponse = ref<ApiResponseMeta | null>(null);

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
      lastResponse.value = {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
      };

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Request failed with status ${response.status}`);
      }

      const contentType = typeof response.headers?.get === 'function'
        ? response.headers.get('content-type') ?? ''
        : '';
      if (contentType.includes('application/json')) {
        data.value = (await response.json()) as T;
      } else {
        data.value = (await response.text()) as unknown as T;
      }
    } catch (err) {
      error.value = err;
      if (!lastResponse.value) {
        lastResponse.value = {
          ok: false,
          status: err instanceof Response ? err.status : 0,
        };
      }
      throw err;
    } finally {
      isLoading.value = false;
    }
  };

  return { data, error, isLoading, fetchData, lastResponse };
}

export type UseApiReturn<T> = ReturnType<typeof useApi<T>>;
