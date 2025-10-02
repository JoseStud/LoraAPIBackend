import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  createHttpClient,
  performRequest,
  requestJson,
  type HttpClient,
} from '@/services/shared/http';

const originalFetch = global.fetch;

const createJsonResponse = <T>(
  payload: T,
  init: Partial<Response> & { status?: number; statusText?: string; ok?: boolean; url?: string } = {},
): Response => {
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

describe('shared http entry helpers', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('merges auth headers from config and request overrides', async () => {
    const response = createJsonResponse({ ok: true });
    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const client = createHttpClient({
      auth: {
        headers: { Authorization: 'Bearer base-token' },
      },
    });

    await requestJson('/auth-test', { headers: { 'X-Custom': 'override' } }, client);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = (fetchMock as unknown as Mock).mock.calls[0] ?? [];
    const headers = new Headers((init?.headers ?? {}) as HeadersInit);
    expect(headers.get('Authorization')).toBe('Bearer base-token');
    expect(headers.get('X-Custom')).toBe('override');
  });

  it('retries transient failures before succeeding', async () => {
    const response = createJsonResponse({ ok: true });
    const fetchMock = vi
      .fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>()
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockRejectedValueOnce(new TypeError('Network error'))
      .mockResolvedValue(response as unknown as Response);

    global.fetch = fetchMock as unknown as typeof fetch;

    const client = createHttpClient({
      retry: { attempts: 3, baseDelayMs: 0, maxDelayMs: 0 },
    });

    const result = await performRequest('/retry-test', {}, client);

    expect(result.meta.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('emits trace events when enabled', async () => {
    const response = createJsonResponse({ ok: true }, { url: '/api/trace' });
    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const logger = vi.fn();

    const client: HttpClient = createHttpClient({
      trace: { enabled: true, logger, console: false },
    });

    await requestJson('/trace-test', {}, client);

    expect(logger).toHaveBeenCalled();
    const events = logger.mock.calls.map(([entry]) => entry);
    expect(events.some((event) => event.event === 'response')).toBe(true);
    expect(events[0]?.method).toBe('GET');
    expect(events[0]?.url).toContain('/trace-test');
  });
});
