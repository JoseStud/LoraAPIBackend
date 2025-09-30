import { describe, it, expect, afterEach, vi } from 'vitest';
import { effectScope } from 'vue';

import { useApi, ApiError } from '@/composables/shared/useApi';

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

  it('ignores stale responses when newer requests resolve first', async () => {
    const firstPayload = { message: 'first' };
    const secondPayload = { message: 'second' };
    const firstResponse = createJsonResponse(firstPayload, { url: '/api/test?first' });
    const secondResponse = createJsonResponse(secondPayload, { url: '/api/test?second' });

    let resolveFirst: ((value: Response) => void) | undefined;
    const firstFetchPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    const fetchMock = vi
      .fn<[], Promise<Response>>()
      .mockReturnValueOnce(firstFetchPromise)
      .mockResolvedValueOnce(secondResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const { fetchData, data, lastResponse, error, isLoading } = useApi<typeof firstPayload>('/api/test');

    const firstCall = fetchData();
    const secondCall = fetchData();

    await expect(secondCall).resolves.toEqual(secondPayload);

    expect(data.value).toEqual(secondPayload);
    expect(lastResponse.value).toMatchObject({ url: '/api/test?second', status: 200 });
    expect(error.value).toBeNull();
    expect(isLoading.value).toBe(false);

    resolveFirst?.(firstResponse);
    await firstCall;

    expect(data.value).toEqual(secondPayload);
    expect(lastResponse.value).toMatchObject({ url: '/api/test?second', status: 200 });
    expect(error.value).toBeNull();
    expect(isLoading.value).toBe(false);
  });

  it('does not overwrite the latest state with stale error responses', async () => {
    const errorPayload = { detail: 'failure' };
    const successPayload = { message: 'success' };
    const failingResponse = createJsonResponse(errorPayload, {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      url: '/api/test?error',
    });
    const successResponse = createJsonResponse(successPayload, { url: '/api/test?success' });

    let resolveFirst: ((value: Response) => void) | undefined;
    const firstFetchPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    const fetchMock = vi
      .fn<[], Promise<Response>>()
      .mockReturnValueOnce(firstFetchPromise)
      .mockResolvedValueOnce(successResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const { fetchData, data, error, lastResponse, isLoading } = useApi<typeof successPayload, typeof errorPayload>('/api/test');

    const firstCall = fetchData();
    const secondCall = fetchData();

    await expect(secondCall).resolves.toEqual(successPayload);

    expect(data.value).toEqual(successPayload);
    expect(error.value).toBeNull();
    expect(lastResponse.value).toMatchObject({ url: '/api/test?success', status: 200 });
    expect(isLoading.value).toBe(false);

    resolveFirst?.(failingResponse);
    await expect(firstCall).rejects.toBeInstanceOf(ApiError);

    expect(data.value).toEqual(successPayload);
    expect(error.value).toBeNull();
    expect(lastResponse.value).toMatchObject({ url: '/api/test?success', status: 200 });
    expect(isLoading.value).toBe(false);
  });

  it('returns the last known data when an in-flight request is aborted', async () => {
    const fetchMock = vi.fn().mockImplementation((_, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { fetchData, cancelActiveRequest, data, error, isLoading } = useApi('/api/test');

    const requestPromise = fetchData();
    cancelActiveRequest();

    await expect(requestPromise).resolves.toBeNull();
    expect(data.value).toBeNull();
    expect(error.value).toBeNull();
    expect(isLoading.value).toBe(false);
  });

  it('automatically cancels active requests when the scope is disposed', async () => {
    const abortSpy = vi.fn();
    const fetchMock = vi.fn().mockImplementation((_, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          abortSpy();
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const scope = effectScope();
    let composable: ReturnType<typeof useApi> | undefined;
    scope.run(() => {
      composable = useApi('/api/test');
    });

    expect(composable).toBeDefined();
    const requestPromise = composable!.fetchData();

    scope.stop();

    await expect(requestPromise).resolves.toBeNull();
    expect(abortSpy).toHaveBeenCalledTimes(1);
  });
});
