import { getFilenameFromContentDisposition, requestBlob } from '@/utils/api';
import { resolveBackendUrl } from '@/utils/backend';

import type { AnalyticsExportOptions, AnalyticsExportResult } from '@/types';

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

  const { blob, response } = await requestBlob(resolveBackendUrl('/export', baseUrl ?? undefined), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

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
