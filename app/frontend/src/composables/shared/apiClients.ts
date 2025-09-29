import { computed, unref, type MaybeRefOrGetter } from 'vue';

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

const resolveRecommendationUrl = (input: MaybeRefOrGetter<string>) =>
  computed(() => {
    try {
      const resolved = typeof input === 'function' ? (input as () => string)() : unref(input);
      const target = typeof resolved === 'string' ? resolved.trim() : '';
      if (!target) {
        return '';
      }
      if (/^https?:\/\//i.test(target)) {
        return target;
      }
      return resolveBackendUrl(target);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to resolve recommendation API URL', error);
      }
      return '';
    }
  });

export const useRecommendationApi = (
  path: MaybeRefOrGetter<string>,
  init: RequestInit = {},
) => {
  const url = resolveRecommendationUrl(path);
  return useApi<RecommendationResponse>(() => url.value, withCredentials(init));
};

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
