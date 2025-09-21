import { computed, reactive } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { useApi } from './useApi';
import type {
  AdapterListQuery,
  AdapterListResponse,
  AdapterRead,
  DashboardStatsSummary,
  GenerationJob,
  GenerationResult,
  RecommendationResponse,
  SystemStatusPayload,
} from '@/types';
import { resolveBackendUrl } from '@/services/generationService';

export type DashboardStatsResponse = DashboardStatsSummary;

const withCredentials = (init: RequestInit = {}): RequestInit => ({
  credentials: 'same-origin',
  ...init,
});

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

export const useRecommendationApi = (
  url: MaybeRefOrGetter<string>,
  init: RequestInit = {},
) => useApi<RecommendationResponse>(url, withCredentials(init));

export const useDashboardStatsApi = () => useApi<DashboardStatsResponse>('/api/v1/dashboard/stats');

export const useSystemStatusApi = () => useApi<SystemStatusPayload>('/api/v1/system/status');

export const useActiveJobsApi = () =>
  useApi<Partial<GenerationJob>[]>(() => resolveBackendUrl('/generation/jobs/active'));

export const useRecentResultsApi = (
  url: MaybeRefOrGetter<string>,
  init: RequestInit = {},
) => useApi<GenerationResult[]>(url, withCredentials(init));
