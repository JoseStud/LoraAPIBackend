/**
 * Types shared by analytics-related components and composables.
 */

export type PerformanceTimeRange = '24h' | '7d' | '30d';

export interface PerformanceKpiSummary {
  total_generations: number;
  generation_growth: number;
  avg_generation_time: number;
  time_improvement: number;
  success_rate: number;
  total_failed: number;
  active_loras: number;
  total_loras: number;
}

export interface TopLoraPerformance {
  id: string | number;
  name: string;
  version?: string | null;
  usage_count: number;
  success_rate: number;
  avg_time: number;
}

export interface ErrorAnalysisEntry {
  type: string;
  count: number;
  percentage: number;
  description: string;
}

export interface PerformanceInsightEntry {
  id: string | number;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | string;
  recommendation?: string;
}

export interface GenerationVolumePoint {
  timestamp: string;
  count: number;
}

export interface PerformanceSeriesPoint {
  timestamp: string;
  avg_time: number;
  success_rate: number;
}

export interface LoraUsageSlice {
  name: string;
  usage_count: number;
}

export interface ResourceUsagePoint {
  timestamp: string;
  cpu_percent: number;
  memory_percent: number;
  gpu_percent: number;
}

export interface PerformanceAnalyticsCharts {
  generationVolume: GenerationVolumePoint[];
  performance: PerformanceSeriesPoint[];
  loraUsage: LoraUsageSlice[];
  resourceUsage: ResourceUsagePoint[];
}
