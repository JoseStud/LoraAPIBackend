import { describe, it, expect, afterEach, vi } from 'vitest';

import { useApi, ApiError } from '@/composables/useApi';

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
  if (originalFetch) {
    global.fetch = originalFetch;
  }
  vi.clearAllMocks();
});

describe('useApi composable', () => {
  it('parses JSON payloads and stores metadata for successful responses', async () => {
    const payload = { message: 'ok', value: 42 };
    const response = createJsonResponse(payload, { url: '/api/test', status: 200, statusText: 'OK' });

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const { fetchData, data, lastResponse, error, isLoading } = useApi<typeof payload>('/api/test');

    const result = await fetchData();

    expect(result).toEqual(payload);
    expect(data.value).toEqual(payload);
    expect(lastResponse.value).toMatchObject({ ok: true, status: 200, statusText: 'OK', url: '/api/test' });
    expect(error.value).toBeNull();
    expect(isLoading.value).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('/api/test', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('throws an ApiError and stores the payload when the response is not ok', async () => {
    const payload = { detail: 'Something went wrong' };
    const response = createJsonResponse(payload, { ok: false, status: 500, statusText: 'Internal Server Error', url: '/api/fail' });

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const { fetchData, error, lastResponse } = useApi<typeof payload, typeof payload>('/api/fail');

    await expect(fetchData()).rejects.toBeInstanceOf(ApiError);

    expect(error.value).toBeInstanceOf(ApiError);
    const apiError = error.value as ApiError<typeof payload>;
    expect(apiError.status).toBe(500);
    expect(apiError.payload).toEqual(payload);
    expect(apiError.message).toContain('Something went wrong');
    expect(lastResponse.value).toMatchObject({ ok: false, status: 500, statusText: 'Internal Server Error', url: '/api/fail' });
  });
});
