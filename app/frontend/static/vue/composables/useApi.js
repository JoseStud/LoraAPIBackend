// Lightweight API composable that delegates to the shared API utilities
// Ensures Vue islands use the same request logic as Alpine/vanilla modules.

import { ref, unref } from 'vue';
import { fetchData as apiFetchData } from '../../js/utils/api.js';

// url can be a string, a ref/computed, or a function returning a string
export function useApi(url, options = {}) {
  const data = ref(null);
  const error = ref(null);
  const isLoading = ref(false);
  const lastResponse = ref(null);

  const resolveUrl = () => {
    try {
      const u = typeof url === 'function' ? url() : unref(url);
      return typeof u === 'string' ? u : '';
    } catch {
      return '';
    }
  };

  const fetchData = async (init = {}) => {
    isLoading.value = true;
    error.value = null;
    try {
      const target = resolveUrl();
      if (!target) throw new Error('Missing URL for useApi');
      const requestOptions = { ...options, ...init };
      const { data: payload, meta } = await apiFetchData(target, {
        ...requestOptions,
        returnResponse: true,
      });
      data.value = payload;
      lastResponse.value = meta;
      return payload;
    } catch (err) {
      error.value = err;
      if (err?.response) {
        lastResponse.value = {
          ok: !!err.response?.ok,
          status: typeof err.response?.status === 'number' ? err.response.status : 0,
          headers: err.response?.headers || null,
        };
      } else {
        lastResponse.value = {
          ok: false,
          status: typeof err?.status === 'number' ? err.status : 0,
          headers: null,
        };
      }
    } finally {
      isLoading.value = false;
    }
  };

  return { data, error, isLoading, fetchData, lastResponse };
}
