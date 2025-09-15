// Lightweight API composable using native fetch
// Designed for Vue islands; avoids adding axios dependency initially.

import { ref } from 'vue';

export function useApi(url, options = {}) {
  const data = ref(null);
  const error = ref(null);
  const isLoading = ref(false);

  const fetchData = async (init = {}) => {
    isLoading.value = true;
    error.value = null;
    try {
      const res = await fetch(url, { credentials: 'same-origin', ...options, ...init });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      data.value = ct.includes('application/json') ? await res.json() : await res.text();
    } catch (err) {
      error.value = err;
    } finally {
      isLoading.value = false;
    }
  };

  return { data, error, isLoading, fetchData };
}

