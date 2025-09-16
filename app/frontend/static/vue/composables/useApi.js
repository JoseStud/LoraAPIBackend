
// Lightweight API composable using centralized API utilities
// Designed for Vue islands; uses utils/api.js for consistency.

import { ref } from 'vue';
import { fetchData } from '../../js/utils/api.js';

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

  const fetchApiData = async (init = {}) => {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await fetchData(url, { credentials: 'same-origin', ...options, ...init });
      data.value = result;

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

  return { data, error, isLoading, fetchData: fetchApiData };
