import { unref } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { useApi } from '@/composables/useApi';
import { getJson } from '@/utils/api';

import type { DashboardStatsSummary, SystemMetricsSnapshot, SystemStatusPayload } from '@/types';

const DEFAULT_BASE = '/api/v1';

const sanitizeBaseUrl = (value?: string): string => {
  if (!value) {
    return DEFAULT_BASE;
  }
  return value.replace(/\/+$/, '') || DEFAULT_BASE;
};

const resolveBase = (baseUrl: MaybeRefOrGetter<string>) => {
  const raw = typeof baseUrl === 'function' ? (baseUrl as () => string)() : unref(baseUrl);
  return sanitizeBaseUrl(raw);
};

export const useSystemStatusApi = (baseUrl: MaybeRefOrGetter<string> = DEFAULT_BASE) =>
  useApi<SystemStatusPayload>(
    () => `${resolveBase(baseUrl)}/system/status`,
    { credentials: 'same-origin' },
  );

export const useDashboardStatsApi = (baseUrl: MaybeRefOrGetter<string> = DEFAULT_BASE) =>
  useApi<DashboardStatsSummary>(
    () => `${resolveBase(baseUrl)}/dashboard/stats`,
    { credentials: 'same-origin' },
  );

export const fetchDashboardStats = async (
  baseUrl: string,
): Promise<DashboardStatsSummary | null> => {
  const base = sanitizeBaseUrl(baseUrl);
  const { data } = await getJson<DashboardStatsSummary>(
    `${base}/dashboard/stats`,
    { credentials: 'same-origin' },
  );
  return data ?? null;
};

export const emptyMetricsSnapshot = (): SystemMetricsSnapshot => ({
  cpu_percent: 0,
  memory_percent: 0,
  memory_used: 0,
  memory_total: 0,
  disk_percent: 0,
  disk_used: 0,
  disk_total: 0,
  gpus: [],
});
