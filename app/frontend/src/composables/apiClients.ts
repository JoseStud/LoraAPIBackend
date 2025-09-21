import { computed, reactive } from 'vue';
import type { AdapterListResponse, AdapterRead } from '@/types/lora';
import { useApi } from './useApi';

export interface AdapterListQuery {
  page?: number;
  perPage?: number;
  search?: string;
  active?: boolean;
  tags?: readonly string[];
  sort?: string;
}

function buildQueryString(query: AdapterListQuery): string {
  const params = new URLSearchParams();

  if (typeof query.page === 'number') {
    params.set('page', String(query.page));
  }

  if (typeof query.perPage === 'number') {
    params.set('per_page', String(query.perPage));
  }

  if (query.search) {
    params.set('search', query.search);
  }

  if (typeof query.active === 'boolean') {
    params.set('active', query.active ? 'true' : 'false');
  }

  if (query.tags?.length) {
    params.set('tags', query.tags.join(','));
  }

  if (query.sort) {
    params.set('sort', query.sort);
  }

  const search = params.toString();
  return search ? `?${search}` : '';
}

export function useAdapterListApi(initialQuery: AdapterListQuery = { page: 1, perPage: 100 }) {
  const query = reactive<AdapterListQuery>({ ...initialQuery });

  const { data, error, isLoading, fetchData, lastResponse } = useApi<AdapterListResponse>(
    () => `/api/v1/adapters${buildQueryString(query)}`,
    { credentials: 'same-origin' },
  );

  const adapters = computed<AdapterRead[]>(() => {
    const payload = data.value as AdapterListResponse | AdapterRead[] | null;
    if (!payload) {
      return [];
    }

    if (Array.isArray(payload)) {
      return payload;
    }

    return Array.isArray(payload.items) ? payload.items : [];
  });

  const load = async (overrides: AdapterListQuery = {}) => {
    Object.assign(query, overrides);
    await fetchData();
    return data.value;
  };

  return {
    data,
    error,
    isLoading,
    fetchData: load,
    lastResponse,
    query,
    adapters,
  };
}

