import { getFilenameFromContentDisposition, requestBlob } from '@/utils/api';
import { resolveBackendUrl } from '@/utils/backend';

import type {
  AnalyticsExportOptions,
  AnalyticsExportResult,
  ErrorAnalysisEntry,
  PerformanceAnalyticsCharts,
  PerformanceInsightEntry,
  PerformanceKpiSummary,
  PerformanceTimeRange,
} from '@/types';

const DEFAULT_EXPORT_OPTIONS: AnalyticsExportOptions = {
  format: 'zip',
  loras: true,
  generations: true,
};

const resolveFallbackFilename = (options: AnalyticsExportOptions): string => {
  const format = options.format?.toLowerCase?.() ?? 'zip';
  return `analytics-export-${Date.now()}.${format}`;
};

export const exportAnalyticsReport = async (
  baseUrl?: string | null,
  options: AnalyticsExportOptions = DEFAULT_EXPORT_OPTIONS,
): Promise<AnalyticsExportResult> => {
  const payload: AnalyticsExportOptions = {
    ...DEFAULT_EXPORT_OPTIONS,
    ...options,
  };

  const { blob, response } = await requestBlob(
    resolveBackendUrl('/import-export/export', baseUrl ?? undefined),
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  const filename =
    getFilenameFromContentDisposition(response.headers.get('content-disposition'))
    ?? resolveFallbackFilename(payload);

  return {
    blob,
    filename,
    contentType: response.headers.get('content-type'),
    size: blob.size,
  };
};

export type AnalyticsService = typeof exportAnalyticsReport;

interface PerformanceAnalyticsChartsApi {
  generation_volume?: PerformanceAnalyticsCharts['generationVolume'];
  performance?: PerformanceAnalyticsCharts['performance'];
  lora_usage?: PerformanceAnalyticsCharts['loraUsage'];
  resource_usage?: PerformanceAnalyticsCharts['resourceUsage'];
}

interface PerformanceAnalyticsSummaryApi {
  time_range?: PerformanceTimeRange;
  generated_at?: string;
  kpis?: Partial<PerformanceKpiSummary> | null;
  chart_data?: PerformanceAnalyticsChartsApi | null;
  error_breakdown?: ErrorAnalysisEntry[] | null;
  performance_insights?: PerformanceInsightEntry[] | null;
}

export interface PerformanceAnalyticsSummaryResult {
  timeRange: PerformanceTimeRange;
  generatedAt: string;
  kpis: Partial<PerformanceKpiSummary> | null;
  chartData: PerformanceAnalyticsCharts;
  errorAnalysis: ErrorAnalysisEntry[];
  performanceInsights: PerformanceInsightEntry[];
}

const emptyCharts = (): PerformanceAnalyticsCharts => ({
  generationVolume: [],
  performance: [],
  loraUsage: [],
  resourceUsage: [],
});

const normaliseChartData = (charts?: PerformanceAnalyticsChartsApi | null): PerformanceAnalyticsCharts => {
  if (!charts) {
    return emptyCharts();
  }

  const asArray = <T>(value: unknown, fallback: T[]): T[] => (Array.isArray(value) ? value as T[] : fallback);

  return {
    generationVolume: asArray(charts.generation_volume, []),
    performance: asArray(charts.performance, []),
    loraUsage: asArray(charts.lora_usage, []),
    resourceUsage: asArray(charts.resource_usage, []),
  } satisfies PerformanceAnalyticsCharts;
};

export const fetchPerformanceAnalytics = async (
  baseUrl?: string | null,
  timeRange: PerformanceTimeRange = '24h',
): Promise<PerformanceAnalyticsSummaryResult> => {
  const base = resolveBackendUrl('/analytics/summary', baseUrl ?? undefined);
  const separator = base.includes('?') ? '&' : '?';
  const targetUrl = `${base}${separator}time_range=${encodeURIComponent(timeRange)}`;

  const response = await fetch(targetUrl, { credentials: 'same-origin' });
  if (!response.ok) {
    const error = await response.text().catch(() => response.statusText);
    throw new Error(error || 'Failed to fetch analytics summary');
  }

  const payload = (await response.json()) as PerformanceAnalyticsSummaryApi | null;

  return {
    timeRange: payload?.time_range ?? timeRange,
    generatedAt: payload?.generated_at ?? new Date().toISOString(),
    kpis: payload?.kpis ?? null,
    chartData: normaliseChartData(payload?.chart_data),
    errorAnalysis: payload?.error_breakdown ?? [],
    performanceInsights: payload?.performance_insights ?? [],
  } satisfies PerformanceAnalyticsSummaryResult;
};

export type FetchPerformanceAnalytics = typeof fetchPerformanceAnalytics;
