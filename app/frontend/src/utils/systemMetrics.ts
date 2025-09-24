import type {
  DashboardStatsSummary,
  SystemMetricsSnapshot,
  SystemResourceStatsSummary,
  SystemStatusLevel,
} from '@/types';

const BYTE_UNITS = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
const DEFAULT_STATUS: SystemStatusLevel = 'unknown';
const DEFAULT_STATS: SystemResourceStatsSummary = {
  uptime: 'N/A',
  active_workers: null,
  total_workers: null,
  database_size: null,
  total_records: null,
  gpu_memory_used: 'N/A',
  gpu_memory_total: 'N/A',
};

const clampPercent = (value?: number | null): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
};

export const formatBytes = (value?: number | null): string => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 'N/A';
  }

  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const formatted = unitIndex === 0 ? size.toFixed(0) : size.toFixed(2);
  return `${Number.parseFloat(formatted).toString()} ${BYTE_UNITS[unitIndex]}`;
};

export const normaliseStatus = (status?: string | null): SystemStatusLevel => {
  if (!status) {
    return DEFAULT_STATUS;
  }

  const value = status.toLowerCase();
  if (value === 'healthy' || value === 'warning' || value === 'error') {
    return value;
  }

  return DEFAULT_STATUS;
};

export const deriveSeverityFromMetrics = (metrics: SystemMetricsSnapshot): SystemStatusLevel => {
  const memoryPercent = clampPercent(metrics.memory_percent);
  const diskPercent = clampPercent(metrics.disk_percent);
  const gpus = metrics.gpus ?? [];

  const hasCriticalGpu = gpus.some((gpu) => {
    const temperature = typeof gpu.temperature === 'number' ? gpu.temperature : 0;
    const memory = clampPercent(gpu.memory_percent);
    return temperature > 85 || memory > 95;
  });

  if (memoryPercent > 95 || diskPercent > 95 || hasCriticalGpu) {
    return 'error';
  }

  const hasWarningGpu = gpus.some((gpu) => {
    const temperature = typeof gpu.temperature === 'number' ? gpu.temperature : 0;
    const memory = clampPercent(gpu.memory_percent);
    return temperature > 75 || memory > 85;
  });

  if (memoryPercent > 85 || diskPercent > 85 || hasWarningGpu) {
    return 'warning';
  }

  return 'healthy';
};

export const mergeStatusLevels = (
  base: SystemStatusLevel,
  derived: SystemStatusLevel,
): SystemStatusLevel => {
  if (base === 'error' || derived === 'error') {
    return 'error';
  }
  if (base === 'warning' || derived === 'warning') {
    return 'warning';
  }
  if (base === 'healthy' && derived === 'healthy') {
    return 'healthy';
  }
  return DEFAULT_STATUS;
};

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

export const buildResourceStats = (
  summary: DashboardStatsSummary | null,
  metrics: SystemMetricsSnapshot,
): SystemResourceStatsSummary => {
  const next: SystemResourceStatsSummary = { ...DEFAULT_STATS };
  const stats = summary?.stats ?? null;

  next.total_records = toOptionalNumber((stats as Record<string, unknown>)?.total_loras);
  next.active_workers = toOptionalNumber((stats as Record<string, unknown>)?.active_workers);
  next.total_workers = toOptionalNumber((stats as Record<string, unknown>)?.total_workers);
  next.database_size = toOptionalNumber((stats as Record<string, unknown>)?.database_size);
  next.gpu_memory_used = formatBytes(metrics.memory_used);
  next.gpu_memory_total = formatBytes(metrics.memory_total);

  return next;
};

export const defaultSystemStatus = DEFAULT_STATUS;
export const defaultResourceStats = (): SystemResourceStatsSummary => ({ ...DEFAULT_STATS });
