/**
 * System monitoring and polling related type definitions shared across the frontend.
 */

import type { SystemStatusState } from './app';

export type StatusClassBinding = string | string[] | Record<string, boolean>;

export type StatusLabel = string;

export interface SystemStatusCardDetailedProps {
  gpuStatusClass?: StatusClassBinding;
  gpuStatusLabel?: StatusLabel;
  queueJobsLabel?: string;
  hasMemoryData?: boolean;
  memoryUsage?: string;
  memoryPercent?: number;
  lastUpdatedLabel?: string;
}

export interface SystemStatusCardSimpleProps {
  gpuStatusClass?: StatusClassBinding;
  gpuStatusLabel?: StatusLabel;
  queueLength?: number | string;
  memoryUsage?: string;
  statusIcon?: string;
  statusLabel?: StatusLabel;
}

export type SystemStatusLevel = 'healthy' | 'warning' | 'error' | 'unknown';

export interface SystemStatusOverview {
  overall: SystemStatusLevel;
  last_check: string;
}

export interface SystemResourceStatsSummary {
  uptime: string;
  active_workers: number;
  total_workers: number;
  database_size: number;
  total_records: number;
  gpu_memory_used: string;
  gpu_memory_total: string;
}

export interface GpuTelemetry {
  id: string | number;
  name: string;
  memory_total?: number;
  memory_used?: number;
  memory_percent?: number;
  temperature?: number;
  utilization?: number;
  fan_speed?: number | null;
  power_draw_watts?: number | null;
  [key: string]: unknown;
}

export interface CpuTelemetry {
  percent: number;
  cores?: number;
  frequency_mhz?: number | null;
  load_average?: [number, number, number];
  [key: string]: unknown;
}

export interface MemoryTelemetry {
  total: number;
  used: number;
  available?: number;
  percent: number;
  [key: string]: unknown;
}

export interface DiskTelemetry {
  total?: number;
  used?: number;
  percent?: number;
  path?: string;
  [key: string]: unknown;
}

export interface SystemMetricsSnapshot {
  cpu_percent: number;
  memory_percent: number;
  memory_used: number;
  memory_total: number;
  disk_percent?: number;
  disk_used?: number;
  disk_total?: number;
  cpu?: CpuTelemetry | null;
  memory?: MemoryTelemetry | null;
  disk?: DiskTelemetry | null;
  gpus: GpuTelemetry[];
  uptime_seconds?: number | null;
  timestamp?: string | null;
  [key: string]: unknown;
}

export interface SystemStatusPayload extends Partial<SystemStatusState> {
  metrics?: SystemMetricsSnapshot | null;
  message?: string | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface PollingMetadata {
  intervalMs: number;
  lastUpdated: string | null;
  isPolling: boolean;
  isLoading?: boolean;
  error?: unknown;
}

export interface DashboardSystemHealth {
  status: string;
  gpu_status?: string;
  gpu_memory?: string;
  queue_status?: string;
  storage_usage?: string;
  [key: string]: unknown;
}

export interface DashboardStatsSummary {
  stats: {
    total_loras: number;
    active_loras: number;
    embeddings_coverage: number;
    recent_imports: number;
    [key: string]: unknown;
  };
  system_health: DashboardSystemHealth;
  [key: string]: unknown;
}
