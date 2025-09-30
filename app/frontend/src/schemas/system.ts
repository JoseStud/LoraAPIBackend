import { z } from 'zod';

import type {
  CpuTelemetry,
  GpuTelemetry,
  MemoryTelemetry,
  DiskTelemetry,
  RecommendationRuntimeStatus,
  SystemImporterStatus,
  SystemMetricsSnapshot,
  SystemQueueStatistics,
  SystemQueueThresholds,
  SystemSdNextStatus,
  SystemStatusPayload,
  SystemThresholds,
} from '@/types/system';

const NullableString = z.union([z.string(), z.null()]).optional();
const NullableNumber = z.union([z.number().finite(), z.null()]).optional();

export const RecommendationRuntimeStatusSchema = z
  .object({
    models_loaded: z.boolean().optional(),
    gpu_available: z.boolean().optional(),
  })
  .passthrough() satisfies z.ZodType<RecommendationRuntimeStatus>;

export const SystemQueueStatisticsSchema = z
  .object({
    active: z.number().int().nonnegative().optional(),
    failed: z.number().int().nonnegative().optional(),
    running: z.number().int().nonnegative().optional(),
  })
  .passthrough() satisfies z.ZodType<SystemQueueStatistics>;

export const SystemQueueThresholdsSchema = z
  .object({
    active_warning: NullableNumber,
    failed_warning: NullableNumber,
  })
  .passthrough() satisfies z.ZodType<SystemQueueThresholds>;

export const SystemThresholdsSchema = z
  .object({
    queue: SystemQueueThresholdsSchema.nullish(),
    importer: z
      .object({
        stale_hours: NullableNumber,
      })
      .passthrough()
      .nullish(),
  })
  .passthrough() satisfies z.ZodType<SystemThresholds>;

export const SystemSdNextStatusSchema = z
  .object({
    configured: z.boolean(),
    base_url: NullableString,
    available: z.boolean().optional(),
    error: NullableString,
    checked_at: NullableString,
  })
  .passthrough() satisfies z.ZodType<SystemSdNextStatus>;

export const SystemImporterStatusSchema = z
  .object({
    import_path: NullableString,
    last_ingested_at: NullableString,
    recent_imports: NullableNumber,
    total_adapters: NullableNumber,
    stale: z.boolean().nullable().optional(),
    stale_threshold_hours: NullableNumber,
  })
  .passthrough() satisfies z.ZodType<SystemImporterStatus>;

export const GpuTelemetrySchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    memory_total: NullableNumber,
    memory_used: NullableNumber,
    memory_percent: NullableNumber,
    temperature: NullableNumber,
    utilization: NullableNumber,
    fan_speed: NullableNumber,
    power_draw_watts: NullableNumber,
  })
  .passthrough() satisfies z.ZodType<GpuTelemetry>;

export const CpuTelemetrySchema = z
  .object({
    percent: z.number().finite(),
    cores: z.number().int().positive().optional(),
    frequency_mhz: NullableNumber,
    load_average: z
      .tuple([z.number().finite(), z.number().finite(), z.number().finite()])
      .optional(),
  })
  .passthrough() satisfies z.ZodType<CpuTelemetry>;

export const MemoryTelemetrySchema = z
  .object({
    total: z.number().finite(),
    used: z.number().finite(),
    available: NullableNumber,
    percent: z.number().finite(),
  })
  .passthrough() satisfies z.ZodType<MemoryTelemetry>;

export const DiskTelemetrySchema = z
  .object({
    total: NullableNumber,
    used: NullableNumber,
    percent: NullableNumber,
    path: NullableString,
  })
  .passthrough() satisfies z.ZodType<DiskTelemetry>;

export const SystemMetricsSnapshotSchema = z
  .object({
    cpu_percent: z.number().finite(),
    memory_percent: z.number().finite(),
    memory_used: z.number().finite(),
    memory_total: z.number().finite(),
    disk_percent: NullableNumber,
    disk_used: NullableNumber,
    disk_total: NullableNumber,
    cpu: CpuTelemetrySchema.nullish(),
    memory: MemoryTelemetrySchema.nullish(),
    disk: DiskTelemetrySchema.nullish(),
    gpus: z.array(GpuTelemetrySchema),
    uptime_seconds: NullableNumber,
    timestamp: NullableString,
  })
  .passthrough() satisfies z.ZodType<SystemMetricsSnapshot>;

export const SystemStatusPayloadSchema = z
  .object({
    gpu_available: z.boolean().optional(),
    queue_length: z.number().int().nonnegative().optional(),
    status: z.string().optional(),
    gpu_status: z.string().optional(),
    memory_used: z.number().finite().optional(),
    memory_total: z.number().finite().optional(),
    active_workers: NullableNumber,
    backend: NullableString,
    queue_eta_seconds: NullableNumber,
    last_updated: NullableString,
    warnings: z.array(z.string()).optional(),
    metrics: SystemMetricsSnapshotSchema.nullish(),
    message: NullableString,
    updated_at: NullableString,
    sdnext: SystemSdNextStatusSchema.nullish(),
    importer: SystemImporterStatusSchema.nullish(),
    recommendations: RecommendationRuntimeStatusSchema.nullish(),
    queue: SystemQueueStatisticsSchema.nullish(),
    thresholds: SystemThresholdsSchema.nullish(),
  })
  .passthrough() satisfies z.ZodType<SystemStatusPayload>;
