/**
 * Types shared by analytics-related components and composables.
 */

import type { BackendSchemas } from './generated';

type Schemas = BackendSchemas;
type ExportConfigSchema = Schemas['ExportConfig'];

export type PerformanceTimeRange = Schemas['PerformanceAnalyticsSummary']['time_range'];

export type PerformanceKpiSummary = Schemas['PerformanceKpiSummary'];

export interface TopLoraPerformance {
  id: string | number;
  name: string;
  version?: string | null;
  usage_count: number;
  success_rate: number;
  avg_time: number;
}

export type ErrorAnalysisEntry = Schemas['ErrorAnalysisEntry'];

export type PerformanceInsightEntry = Schemas['PerformanceInsightEntry'];

export type GenerationVolumePoint = Schemas['GenerationVolumePoint'];

export type PerformanceSeriesPoint = Schemas['PerformanceSeriesPoint'];

export type LoraUsageSlice = Schemas['LoraUsageSlice'];

export type ResourceUsagePoint = Schemas['ResourceUsagePoint'];

export interface PerformanceAnalyticsCharts {
  generationVolume: GenerationVolumePoint[];
  performance: PerformanceSeriesPoint[];
  loraUsage: LoraUsageSlice[];
  resourceUsage: ResourceUsagePoint[];
}

export type AnalyticsExportOptions = Partial<ExportConfigSchema>;

export interface AnalyticsExportResult {
  blob: Blob;
  filename: string;
  contentType?: string | null;
  size: number;
}
