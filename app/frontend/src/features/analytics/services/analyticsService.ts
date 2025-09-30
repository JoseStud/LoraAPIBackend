import { getFilenameFromContentDisposition } from '@/services/apiClient';
import { resolveBackendClient, type BackendClient } from '@/services/backendClient';

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

const resolveClient = (client?: BackendClient | null): BackendClient => resolveBackendClient(client ?? undefined);

export const exportAnalyticsReport = async (
  options: AnalyticsExportOptions = DEFAULT_EXPORT_OPTIONS,
  client?: BackendClient | null,
): Promise<AnalyticsExportResult> => {
  const payload: AnalyticsExportOptions = {
    ...DEFAULT_EXPORT_OPTIONS,
    ...options,
  };

  const backend = resolveClient(client);
  const { blob, response } = await backend.requestBlob(
    '/export',
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
  timeRange: PerformanceTimeRange = '24h',
  client?: BackendClient | null,
): Promise<PerformanceAnalyticsSummaryResult> => {
  const backend = resolveClient(client);
  const baseUrl = backend.resolve('/analytics/summary');
  const separator = baseUrl.includes('?') ? '&' : '?';
  const targetUrl = `${baseUrl}${separator}time_range=${encodeURIComponent(timeRange)}`;

  const data = await backend.getJson<PerformanceAnalyticsSummaryApi>(targetUrl);
  const payload = data ?? null;

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
