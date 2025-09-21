import type { MaybeRefOrGetter } from 'vue';

import { useApi } from './useApi';
import type {
  AdapterListResponse,
  AdapterRead,
  GenerationJob,
  GenerationResult,
  RecommendationResponse,
  SystemStatusState,
} from '@/types';

type AdapterListResult = AdapterListResponse | AdapterRead[];

type SystemStatusResponse = Partial<SystemStatusState> & Record<string, unknown>;

export type DashboardStatsResponse = {
  stats?: Record<string, unknown>;
  system_health?: Record<string, unknown>;
  [key: string]: unknown;
};

const withCredentials = (init: RequestInit = {}): RequestInit => ({
  credentials: 'same-origin',
  ...init,
});

export const useAdapterListApi = (
  url: MaybeRefOrGetter<string>,
  init: RequestInit = {},
) => useApi<AdapterListResult>(url, withCredentials(init));

export const useRecommendationApi = (
  url: MaybeRefOrGetter<string>,
  init: RequestInit = {},
) => useApi<RecommendationResponse>(url, withCredentials(init));

export const useDashboardStatsApi = () => useApi<DashboardStatsResponse>('/api/v1/dashboard/stats');

export const useSystemStatusApi = () => useApi<SystemStatusResponse>('/api/v1/system/status');

export const useActiveJobsApi = () => useApi<Partial<GenerationJob>[]>('/api/v1/generation/jobs/active');

export const useRecentResultsApi = (
  url: MaybeRefOrGetter<string>,
  init: RequestInit = {},
) => useApi<GenerationResult[]>(url, withCredentials(init));
