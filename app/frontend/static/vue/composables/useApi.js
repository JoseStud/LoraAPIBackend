// Lightweight API composable using native fetch
// Designed for Vue islands; avoids adding axios dependency initially.

import { ref, unref } from 'vue';

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
      const res = await fetch(target, { credentials: 'same-origin', ...options, ...init });
      // capture minimal response metadata for callers
      lastResponse.value = {
        ok: !!res?.ok,
        status: typeof res?.status === 'number' ? res.status : 0,
        headers: res?.headers || null,
      };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = (res && res.headers && typeof res.headers.get === 'function')
        ? (res.headers.get('content-type') || '')
        : '';
      // If content-type is unavailable, assume JSON when a json() method exists
      const preferJson = ct.includes('application/json') || typeof res.json === 'function';
      data.value = preferJson ? await res.json() : await res.text();
    } catch (err) {
      error.value = err;
    } finally {
      isLoading.value = false;
    }
  };

  return { data, error, isLoading, fetchData, lastResponse };
}
