/**
 * System monitoring and polling related type definitions shared across the frontend.
 */

import type { SystemStatusState } from './app';

export interface SystemSdNextStatus {
  configured: boolean;
  base_url?: string | null;
  available?: boolean;
  error?: string | null;
  checked_at?: string | null;
  [key: string]: unknown;
}

export interface SystemImporterStatus {
  import_path?: string | null;
  last_ingested_at?: string | null;
  recent_imports?: number | null;
  total_adapters?: number | null;
  stale?: boolean | null;
  stale_threshold_hours?: number | null;
  [key: string]: unknown;
}

export interface RecommendationRuntimeStatus {
  models_loaded?: boolean | null;
  gpu_available?: boolean | null;
  [key: string]: unknown;
}

export interface SystemQueueStatistics {
  active?: number;
  failed?: number;
  running?: number;
  [key: string]: unknown;
}

export interface SystemQueueThresholds {
  active_warning?: number | null;
  failed_warning?: number | null;
  [key: string]: unknown;
}

export interface SystemThresholds {
  queue?: SystemQueueThresholds | null;
  importer?: { stale_hours?: number | null; [key: string]: unknown } | null;
  [key: string]: unknown;
}

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
  active_workers: number | null;
  total_workers: number | null;
  database_size: number | null;
  total_records: number | null;
  gpu_memory_used: string;
  gpu_memory_total: string;
}

export interface GpuTelemetry {
  id: string | number;
  name: string;
  memory_total?: number | null;
  memory_used?: number | null;
  memory_percent?: number | null;
  temperature?: number | null;
  utilization?: number | null;
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
  available?: number | null;
  percent: number;
  [key: string]: unknown;
}

export interface DiskTelemetry {
  total?: number | null;
  used?: number | null;
  percent?: number | null;
  path?: string | null;
  [key: string]: unknown;
}

export interface SystemMetricsSnapshot {
  cpu_percent: number;
  memory_percent: number;
  memory_used: number;
  memory_total: number;
  disk_percent?: number | null;
  disk_used?: number | null;
  disk_total?: number | null;
  cpu?: CpuTelemetry | null;
  memory?: MemoryTelemetry | null;
  disk?: DiskTelemetry | null;
  gpus: GpuTelemetry[];
  uptime_seconds?: number | null;
  timestamp?: string | null;
  [key: string]: unknown;
}

export interface SystemStatusPayload extends Partial<SystemStatusState> {
  gpu_available?: boolean | null;
  queue_length?: number | null;
  status?: string | null;
  gpu_status?: string | null;
  memory_used?: number | null;
  memory_total?: number | null;
  active_workers?: number | null;
  queue_eta_seconds?: number | null;
  last_updated?: string | null;
  metrics?: SystemMetricsSnapshot | null;
  message?: string | null;
  updated_at?: string | null;
  sdnext?: SystemSdNextStatus | null;
  importer?: SystemImporterStatus | null;
  recommendations?: RecommendationRuntimeStatus | null;
  queue?: SystemQueueStatistics | null;
  thresholds?: SystemThresholds | null;
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
