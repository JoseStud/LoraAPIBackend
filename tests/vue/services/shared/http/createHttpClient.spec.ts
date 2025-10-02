import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createHttpClient,
  type HttpTraceLogEntry,
} from '@/services/shared/http';

const originalFetch = global.fetch;

const createJsonResponse = <T>(
  payload: T,
  init: Partial<Response> & { status?: number; statusText?: string; ok?: boolean; url?: string } = {},
) => {
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers,
    url: init.url ?? '/api/test',
    json: vi.fn().mockResolvedValue(payload),
    text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
  } as unknown as Response;
};

describe('shared http client', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('merges configured auth headers with request headers', async () => {
    const response = createJsonResponse({ ok: true });
    const fetchMock = vi.fn().mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createHttpClient({
      auth: { headers: { Authorization: 'Bearer base-token' } },
      trace: false,
    });

    await client.postJson('/auth-test', { value: 1 }, {
      headers: { 'X-Custom': 'value' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.credentials).toBe('same-origin');

    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer base-token');
    expect(headers.get('X-Custom')).toBe('value');
  });

  it('retries idempotent requests up to the configured attempts', async () => {
    const response = createJsonResponse({ message: 'ok' });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createHttpClient({
      retry: { attempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
      trace: false,
    });

    const result = await client.requestJson<{ message: string }>('/retry-test');

    expect(result.data).toEqual({ message: 'ok' });
    expect(fetchMock.mock.calls).toHaveLength(2);
  });

  it('emits trace logs for retry and response events', async () => {
    const response = createJsonResponse({ message: 'ok' });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValue(response);
    global.fetch = fetchMock as unknown as typeof fetch;

    const logger = vi.fn<[HttpTraceLogEntry], void>();

    const client = createHttpClient({
      retry: { attempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
      trace: { enabled: true, console: false, logger },
    });

    await client.getJson('/trace-test');

    const events = logger.mock.calls.map(([entry]) => entry.event);
    expect(events).toContain('error');
    expect(events).toContain('retry');
    expect(events).toContain('response');
  });
});
