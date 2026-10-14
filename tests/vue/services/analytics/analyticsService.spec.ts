import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchPerformanceAnalytics } from '@/features/analytics/services/analyticsService';
import { createBackendClient } from '@/services/shared/http';

const requestedUrl = (fetchMock: ReturnType<typeof vi.fn>): string => {
  const [input] = fetchMock.mock.calls[0] ?? [];
  return typeof input === 'string' ? input : (input as Request).url;
};

describe('fetchPerformanceAnalytics', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('requests the summary under the backend base exactly once', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ time_range: '7d' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchPerformanceAnalytics('7d', createBackendClient('/api/v1'));

    expect(requestedUrl(fetchMock)).toMatch(/^(https?:\/\/[^/]+)?\/api\/v1\/analytics\/summary\?time_range=7d$/);
    expect(result.timeRange).toBe('7d');
  });
});
