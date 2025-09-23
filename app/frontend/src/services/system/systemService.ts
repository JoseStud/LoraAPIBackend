import type { MaybeRefOrGetter } from 'vue';

import { useApi } from '@/composables/useApi';
import { createBackendUrlGetter } from '@/utils/backend';

import type {
  DashboardStatsSummary,
  FrontendRuntimeSettings,
  SystemMetricsSnapshot,
  SystemStatusPayload,
} from '@/types';

export const useSystemStatusApi = (
  baseUrl?: MaybeRefOrGetter<string | null>,
) =>
  useApi<SystemStatusPayload>(
    createBackendUrlGetter('/system/status', baseUrl),
    { credentials: 'same-origin' },
  );

export const useDashboardStatsApi = (
  baseUrl?: MaybeRefOrGetter<string | null>,
) =>
  useApi<DashboardStatsSummary>(
    createBackendUrlGetter('/dashboard/stats', baseUrl),
    { credentials: 'same-origin' },
  );

export const useFrontendSettingsApi = () =>
  useApi<FrontendRuntimeSettings>(
    () => '/frontend/settings',
    { credentials: 'same-origin' },
  );

export const loadFrontendSettings = async (): Promise<FrontendRuntimeSettings | null> => {
  const api = useFrontendSettingsApi();
  return api.fetchData();
};

export const fetchDashboardStats = async (
  baseUrl?: string | null,
): Promise<DashboardStatsSummary | null> => {
  const api = useDashboardStatsApi(baseUrl);
  return api.fetchData();
};

export const fetchSystemStatus = async (
  baseUrl?: string | null,
): Promise<SystemStatusPayload | null> => {
  const api = useSystemStatusApi(baseUrl);
  return api.fetchData();
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

const SIZE_UNITS: Record<string, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4,
};

const clampPercentage = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

const toBytes = (match: RegExpMatchArray): number => {
  const value = Number.parseFloat(match[1] ?? '0');
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const unit = (match[2] ?? 'B').toUpperCase();
  const multiplier = SIZE_UNITS[unit] ?? 1;
  return value * multiplier;
};

const parseUsageString = (input?: string | null): { used: number; total: number } | null => {
  if (!input) {
    return null;
  }

  const matches = Array.from(input.matchAll(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)/gi));
  if (!matches.length) {
    return null;
  }

  const used = toBytes(matches[0]);
  const total = matches[1] ? toBytes(matches[1]) : used;

  if (!Number.isFinite(used) || used < 0) {
    return null;
  }

  return {
    used,
    total: Number.isFinite(total) && total > 0 ? total : used,
  };
};

const parsePercentage = (input?: string | null): number | null => {
  if (!input) {
    return null;
  }

  const match = input.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[1] ?? '0');
  return Number.isFinite(value) ? value : null;
};

export const deriveMetricsFromDashboard = (
  summary?: DashboardStatsSummary | null,
): SystemMetricsSnapshot => {
  const snapshot = emptyMetricsSnapshot();
  if (!summary) {
    return snapshot;
  }

  const health = summary.system_health ?? {};

  const memoryUsage = parseUsageString(health.gpu_memory);
  if (memoryUsage) {
    snapshot.memory_used = memoryUsage.used;
    snapshot.memory_total = memoryUsage.total;
    snapshot.memory_percent = memoryUsage.total
      ? clampPercentage((memoryUsage.used / memoryUsage.total) * 100)
      : 0;
  } else {
    const memoryPercent = parsePercentage(health.gpu_memory);
    if (memoryPercent != null) {
      snapshot.memory_percent = clampPercentage(memoryPercent);
    }
  }

  const diskUsage = parseUsageString(health.storage_usage);
  if (diskUsage) {
    snapshot.disk_used = diskUsage.used;
    snapshot.disk_total = diskUsage.total;
    snapshot.disk_percent = diskUsage.total
      ? clampPercentage((diskUsage.used / diskUsage.total) * 100)
      : snapshot.disk_percent;
  } else {
    const diskPercent = parsePercentage(health.storage_usage);
    if (diskPercent != null) {
      snapshot.disk_percent = clampPercentage(diskPercent);
    }
  }

  return snapshot;
};
