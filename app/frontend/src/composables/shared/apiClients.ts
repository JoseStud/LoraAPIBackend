import type { MaybeRefOrGetter } from 'vue';

import { useApi } from './useApi';
import type {
  DashboardStatsSummary,
  GenerationJob,
  GenerationResult,
  RecommendationResponse,
} from '@/types';
import { useDashboardStatsApi, useSystemStatusApi } from '@/services/system';
import { resolveBackendUrl } from '@/utils/backend';

export type DashboardStatsResponse = DashboardStatsSummary;

const withCredentials = (init: RequestInit = {}): RequestInit => ({
  credentials: 'same-origin',
  ...init,
});

export const useRecommendationApi = (
  url: MaybeRefOrGetter<string>,
  init: RequestInit = {},
) => useApi<RecommendationResponse>(url, withCredentials(init));

export const useActiveJobsApi = () =>
  useApi<Partial<GenerationJob>[]>(() => resolveBackendUrl('/generation/jobs/active'));

export const useRecentResultsApi = (
  url: MaybeRefOrGetter<string>,
  init: RequestInit = {},
) => useApi<GenerationResult[]>(url, withCredentials(init));

export { useDashboardStatsApi, useSystemStatusApi };
