import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/httpAuth', async () => {
  const actual = await vi.importActual<typeof import('@/utils/httpAuth')>('@/utils/httpAuth');
  return {
    ...actual,
    buildAuthenticatedHeaders: vi.fn((...sources: Array<HeadersInit | undefined>) => ({
      ...actual.mergeHeaders(...sources),
      'X-API-Key': 'stub-key',
    })),
  };
});

import { ApiError } from '@/types';
import {
  createHttpClient,
  DEFAULT_RETRY_ATTEMPTS,
  type ApiRequestInit,
  type ApiRequestResult,
  type HttpTraceLogEntry,
} from '@/services/shared/http/createHttpClient';
import { performRequest, requestJson } from '@/services/shared/http';
import { buildAuthenticatedHeaders } from '@/utils/httpAuth';

const createJsonResponse = (payload: unknown, overrides: Partial<Response> = {}): Response => ({
  ok: overrides.ok ?? true,
  status: overrides.status ?? 200,
  statusText: overrides.statusText ?? 'OK',
  headers: new Headers({ 'content-type': 'application/json', ...(overrides.headers as HeadersInit | undefined) }),
  json: vi.fn().mockResolvedValue(payload),
  text: vi.fn().mockResolvedValue(typeof payload === 'string' ? payload : JSON.stringify(payload)),
  blob: vi.fn().mockResolvedValue(new Blob([JSON.stringify(payload)], { type: 'application/json' })),
}) as unknown as Response;

const createTextResponse = (payload: string, overrides: Partial<Response> = {}): Response => ({
  ok: overrides.ok ?? true,
  status: overrides.status ?? 200,
  statusText: overrides.statusText ?? 'OK',
  headers: new Headers({ 'content-type': 'text/plain', ...(overrides.headers as HeadersInit | undefined) }),
  text: vi.fn().mockResolvedValue(payload),
}) as unknown as Response;

const unavailable = () => createJsonResponse({}, { ok: false, status: 503, statusText: 'Unavailable' });

const NO_DELAY = { baseDelayMs: 0, maxDelayMs: 0 } as const;

describe('createHttpClient', () => {
  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();
  const fetchImpl = fetchMock as unknown as typeof fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(buildAuthenticatedHeaders).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves relative paths against the provided base URL', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({}));
    const client = createHttpClient({ baseURL: () => 'https://example.test/api/v1/', fetch: fetchImpl });

    await client.requestJson('/status');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/api/v1/status',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('applies authentication headers exactly once per request', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({}));
    const client = createHttpClient({ fetch: fetchImpl });

    const init: ApiRequestInit = { headers: { 'X-Test': 'value' } };
    await client.requestJson('https://api.example/status', init);

    expect(buildAuthenticatedHeaders).toHaveBeenCalledTimes(1);
    expect(buildAuthenticatedHeaders).toHaveBeenCalledWith(undefined, { 'X-Test': 'value' });
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestInit?.headers).toMatchObject({ 'X-Test': 'value', 'X-API-Key': 'stub-key' });
  });

  it('applies authentication headers once through the shared request helpers', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({}));
    const client = createHttpClient({ fetch: fetchImpl });

    await requestJson('https://api.example/status', { headers: { 'X-Test': 'value' } }, client);
    await client.postJson('https://api.example/items', { name: 'x' });

    expect(buildAuthenticatedHeaders).toHaveBeenCalledTimes(2);
  });

  it('omits the API key when auth is disabled', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({}));
    const client = createHttpClient({ fetch: fetchImpl, auth: false });

    await client.requestJson('https://api.example/status', { headers: { 'X-Test': 'value' } });

    expect(buildAuthenticatedHeaders).not.toHaveBeenCalled();
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestInit?.headers).toEqual({ 'X-Test': 'value' });
  });

  it('normalises API errors into ApiError instances', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({ detail: 'nope' }, { ok: false, status: 500, statusText: 'Failure' }),
    );
    const client = createHttpClient({ fetch: fetchImpl, retry: { attempts: 1 } });

    await expect(client.requestJson('https://api.example/fail')).rejects.toMatchObject({
      message: 'nope',
      status: 500,
    });
  });

  it.each([401, 403, 404, 422])('does not retry a %i response', async (status) => {
    fetchMock.mockResolvedValue(createJsonResponse({ detail: 'denied' }, { ok: false, status }));
    const client = createHttpClient({ fetch: fetchImpl, retry: NO_DELAY });

    const error = await client.requestJson('https://api.example/denied').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status, message: 'denied' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it(`retries idempotent 5xx responses up to ${DEFAULT_RETRY_ATTEMPTS} attempts by default`, async () => {
    fetchMock.mockResolvedValue(unavailable());
    const client = createHttpClient({ fetch: fetchImpl, retry: NO_DELAY });

    await expect(client.requestJson('https://api.example/retry')).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(DEFAULT_RETRY_ATTEMPTS);
  });

  it('retries a retryable response and reports the retry', async () => {
    fetchMock.mockResolvedValueOnce(unavailable()).mockResolvedValueOnce(createJsonResponse({ payload: true }));
    const logger = vi.fn<[HttpTraceLogEntry], void>();
    const client = createHttpClient({
      fetch: fetchImpl,
      retry: { attempts: 2, ...NO_DELAY },
      trace: { logger, console: false },
    });

    const result = await client.requestJson<{ payload: boolean }>('https://api.example/retry');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ payload: true });
    const retries = logger.mock.calls.filter(([entry]) => entry.event === 'retry');
    expect(retries).toHaveLength(1);
    expect(retries[0]?.[0]).toMatchObject({ attempt: 1, nextAttempt: 2, status: 503 });
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('never retries %s requests', async (method) => {
    fetchMock.mockResolvedValue(unavailable());
    const client = createHttpClient({
      fetch: fetchImpl,
      retry: { attempts: 3, retryOnMethods: [method], ...NO_DELAY },
    });

    await expect(client.request('https://api.example/write', { method })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries an aborted request', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValue(abortError);
    const client = createHttpClient({ fetch: fetchImpl, retry: { attempts: 3, ...NO_DELAY } });

    await expect(client.request('https://api.example/abort')).rejects.toBe(abortError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('settles as aborted, without retrying, when the signal aborts before a 5xx arrives', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort();
      return unavailable();
    });
    const client = createHttpClient({ fetch: fetchImpl, retry: { attempts: 3, ...NO_DELAY } });

    await expect(
      client.request('https://api.example/abort', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries network failures and wraps the last one in an ApiError with status 0', async () => {
    const networkError = new TypeError('Failed to fetch');
    fetchMock.mockRejectedValue(networkError);
    const client = createHttpClient({ fetch: fetchImpl, retry: { attempts: 2, ...NO_DELAY } });

    const error = await performRequest('https://api.example/offline', {}, client).catch((err: unknown) => err);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 0, statusText: 'Network Error' });
    expect((error as ApiError).cause).toBe(networkError);
  });

  it('emits trace entries for responses', async () => {
    fetchMock.mockResolvedValue(createTextResponse('ok'));
    const logger = vi.fn<[HttpTraceLogEntry], void>();
    const client = createHttpClient({ fetch: fetchImpl, trace: { logger, console: false } });

    const response: ApiRequestResult<string | null> = await client.request('https://api.example/text', {
      parseMode: 'text',
    });

    expect(response.data).toBe('ok');
    expect(logger).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'response', method: 'GET', url: 'https://api.example/text', status: 200 }),
    );
  });

  it('exposes the resolved base URL when no path is provided', () => {
    const client = createHttpClient({ baseURL: () => 'https://example.test/api/' });
    expect(client.resolve()).toBe('https://example.test/api/');
  });

  it('preserves ApiError instances raised from failed requests', async () => {
    const apiError = new ApiError({
      message: 'boom',
      status: 502,
      statusText: 'Bad Gateway',
      payload: null,
      meta: { ok: false, status: 502, statusText: 'Bad Gateway', headers: undefined, url: 'https://api.example' },
    });
    fetchMock.mockRejectedValue(apiError);
    const client = createHttpClient({ fetch: fetchImpl, retry: NO_DELAY });

    await expect(client.requestJson('https://api.example/fail')).rejects.toBe(apiError);
  });
});
