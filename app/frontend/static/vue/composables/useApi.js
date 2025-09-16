// Lightweight API composable using centralized API utilities
// Designed for Vue islands; uses utils/api.js for consistency.

import { ref } from 'vue';
import { fetchData } from '../../js/utils/api.js';

export function useApi(url, options = {}) {
  const data = ref(null);
  const error = ref(null);
  const isLoading = ref(false);

  const fetchApiData = async (init = {}) => {
    isLoading.value = true;
    error.value = null;
    try {
      const result = await fetchData(url, { credentials: 'same-origin', ...options, ...init });
      data.value = result;
    } catch (err) {
      error.value = err;
    } finally {
      isLoading.value = false;
    }
  };

  return { data, error, isLoading, fetchData: fetchApiData };
}

