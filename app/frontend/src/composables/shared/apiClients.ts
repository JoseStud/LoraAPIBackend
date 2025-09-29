import type { MaybeRefOrGetter } from 'vue';

import { useApi } from './useApi';
import type {
  DashboardStatsSummary,
  GenerationJob,
  GenerationResult,
  RecommendationResponse,
  SystemStatusPayload,
} from '@/types';

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

export const useDashboardStatsApi = (init: RequestInit = {}) =>
  useApi<DashboardStatsSummary>(() => resolveBackendUrl('/dashboard/stats'), withCredentials(init));

export const useSystemStatusApi = (init: RequestInit = {}) =>
  useApi<SystemStatusPayload>(() => resolveBackendUrl('/system/status'), withCredentials(init));
