import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  performConfiguredRequest,
  performRequest,
  requestConfiguredJson,
  requestJson,
  resetDefaultHttpClient,
} from '@/services/shared/http';
import { ApiError } from '@/types';

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

afterEach(() => {
  global.fetch = originalFetch;
  vi.resetAllMocks();
  resetDefaultHttpClient();
});

describe('apiClient helpers', () => {
  it('returns payload and metadata for successful JSON responses', async () => {
    const payload = { message: 'ok', value: 42 };
    const response = createJsonResponse(payload, { status: 201, statusText: 'Created', url: '/api/success' });

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const result = await requestJson<typeof payload>('/api/success', { method: 'POST' });

    expect(result.data).toEqual(payload);
    expect(result.meta).toMatchObject({ ok: true, status: 201, statusText: 'Created', url: '/api/success' });
    expect(fetchMock).toHaveBeenCalledWith('/api/success', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('throws ApiError with parsed payload details for failed responses', async () => {
    const payload = { detail: 'Invalid request' };
    const response = createJsonResponse(payload, {
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      url: '/api/error',
    });

    global.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;

    try {
      await requestJson('/api/error');
      throw new Error('Expected requestJson to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        status: 422,
        payload,
      });
      expect((error as ApiError).message).toContain('Invalid request');
    }
  });

  it('propagates abort errors without wrapping them', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    global.fetch = vi.fn().mockRejectedValue(abortError) as unknown as typeof fetch;

    await expect(performRequest('/api/abort')).rejects.toBe(abortError);
  });

  it('merges default and override options for configured requests', async () => {
    const response = createJsonResponse({ ok: true });
    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const controller = new AbortController();
    await performConfiguredRequest(
      {
        target: () => '/api/configured',
        init: {
          headers: { 'X-Test': 'base' },
          credentials: 'include',
        },
      },
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(init?.signal).toBe(controller.signal);

    const headers = new Headers(init?.headers as HeadersInit);
    expect(headers.get('X-Test')).toBe('base');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('returns parsed data for configured JSON requests', async () => {
    const payload = { message: 'configured' };
    const response = createJsonResponse(payload);
    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const result = await requestConfiguredJson<typeof payload>({
      target: '/api/configured-json',
      init: { headers: { 'X-Trace': 'value' } },
    });

    expect(result.data).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/configured-json',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });
});
