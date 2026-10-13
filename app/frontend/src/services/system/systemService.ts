import { createBackendHttpClient, type BackendHttpClientInput } from '@/services/shared/http/backendClient';
import type { HttpClient } from '@/services/shared/http/createHttpClient';
import { createBackendPathBuilder } from '@/utils/backend';

import type {
  DashboardStatsSummary,
  FrontendRuntimeSettings,
  GpuTelemetry,
  SystemMetricsSnapshot,
  SystemStatusPayload,
} from '@/types';
const TRACE_OPTIONS = { trace: { enabled: true } } as const;

const defaultClient = createBackendHttpClient(TRACE_OPTIONS);

const resolveClient = (input?: BackendHttpClientInput): HttpClient => {
  if (typeof input === 'string') {
    return createBackendHttpClient({ ...TRACE_OPTIONS, baseURL: input });
  }

  if (input) {
    return input;
  }

  return defaultClient;
};

const frontendPath = createBackendPathBuilder('frontend');
const dashboardPath = createBackendPathBuilder('dashboard');
const systemPath = createBackendPathBuilder('system');

const requestBackendJson = async <TPayload>(
  path: string,
  client?: BackendHttpClientInput,
): Promise<TPayload | null> => {
  const backend = resolveClient(client);
  const result = await backend.requestJson<TPayload>(path);
  return (result.data as TPayload | null) ?? null;
};

export const loadFrontendSettings = async (): Promise<FrontendRuntimeSettings | null> =>
  requestBackendJson<FrontendRuntimeSettings>(frontendPath('settings'));

export const fetchDashboardStats = async (
  client?: BackendHttpClientInput,
): Promise<DashboardStatsSummary | null> =>
  requestBackendJson<DashboardStatsSummary>(dashboardPath('stats'), client);

export const fetchSystemStatus = async (
  client?: BackendHttpClientInput,
): Promise<SystemStatusPayload | null> =>
  requestBackendJson<SystemStatusPayload>(systemPath('status'), client);

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

const MIB = 1024 ** 2;

const finiteOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Convert the backend's live metrics (sizes in MiB) into a snapshot in bytes. */
const snapshotFromLiveMetrics = (live: Record<string, unknown>): SystemMetricsSnapshot | null => {
  const cpuPercent = finiteOrNull(live.cpu_percent);
  const memoryTotal = finiteOrNull(live.memory_total);
  if (cpuPercent == null || memoryTotal == null) {
    return null;
  }

  const toBytesFromMib = (value: unknown): number | null => {
    const mib = finiteOrNull(value);
    return mib == null ? null : mib * MIB;
  };

  const gpus = Array.isArray(live.gpus) ? (live.gpus as GpuTelemetry[]) : [];

  return {
    ...emptyMetricsSnapshot(),
    cpu_percent: clampPercentage(cpuPercent),
    memory_percent: clampPercentage(finiteOrNull(live.memory_percent) ?? 0),
    memory_used: toBytesFromMib(live.memory_used) ?? 0,
    memory_total: memoryTotal * MIB,
    disk_percent: finiteOrNull(live.disk_percent),
    disk_used: toBytesFromMib(live.disk_used),
    disk_total: toBytesFromMib(live.disk_total),
    gpus,
    uptime_seconds: finiteOrNull(live.uptime_seconds),
    timestamp: typeof live.timestamp === 'string' ? live.timestamp : null,
  };
};

export const deriveMetricsFromDashboard = (
  summary?: DashboardStatsSummary | null,
): SystemMetricsSnapshot => {
  const snapshot = emptyMetricsSnapshot();
  if (!summary) {
    return snapshot;
  }

  const live =
    summary.metrics && typeof summary.metrics === 'object'
      ? snapshotFromLiveMetrics(summary.metrics as Record<string, unknown>)
      : null;
  if (live) {
    return live;
  }

  // Older backends only send formatted strings; gpu_memory is the best we have.

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
