import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/httpAuth', () => ({
  buildAuthenticatedHeaders: vi.fn((...sources: Array<Record<string, string> | undefined>) => ({
    ...Object.assign({}, ...sources),
    'X-API-Key': 'stub-key',
  })),
}));

import { ApiError } from '@/types';
import {
  createHttpClient,
  type ApiRequestInit,
  type ApiRequestResult,
  type HttpClientHooks,
} from '@/services/httpClient';
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

describe('createHttpClient', () => {
  const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.mocked(buildAuthenticatedHeaders).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('resolves relative paths against the provided base URL', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({}));
    const client = createHttpClient({
      baseUrl: () => 'https://example.test/api/v1/',
      fetch: fetchMock as unknown as typeof fetch,
      trace: false,
    });

    await client.requestJson('/status');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/api/v1/status',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('merges authentication headers for every request', async () => {
    fetchMock.mockResolvedValue(createJsonResponse({}));
    const client = createHttpClient({
      fetch: fetchMock as unknown as typeof fetch,
      trace: false,
    });

    const init: ApiRequestInit = { headers: { 'X-Test': 'value' } };
    await client.requestJson('https://api.example/status', init);

    expect(buildAuthenticatedHeaders).toHaveBeenCalledWith(undefined, { 'X-Test': 'value' });
    const [, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(requestInit?.headers).toMatchObject({ 'X-Test': 'value', 'X-API-Key': 'stub-key' });
  });

  it('normalises API errors into ApiError instances', async () => {
    fetchMock.mockResolvedValue(
      createJsonResponse({ detail: 'nope' }, { ok: false, status: 500, statusText: 'Failure' }),
    );
    const client = createHttpClient({ fetch: fetchMock as unknown as typeof fetch, trace: false });

    await expect(client.fetchJson('https://api.example/fail')).rejects.toMatchObject({
      message: 'nope',
      status: 500,
    });
  });

  it('retries retryable responses when configured', async () => {
    fetchMock
      .mockResolvedValueOnce(createJsonResponse({}, { ok: false, status: 503, statusText: 'Unavailable' }))
      .mockResolvedValueOnce(createJsonResponse({ payload: true }));
    const hooks: HttpClientHooks = {
      onRetry: vi.fn(),
    };
    const client = createHttpClient({
      fetch: fetchMock as unknown as typeof fetch,
      retry: { attempts: 2, baseDelayMs: 0, maxDelayMs: 0 },
      hooks,
      trace: false,
    });

    const result = await client.requestJson<{ payload: boolean }>('https://api.example/retry');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ payload: true });
    expect(hooks.onRetry).toHaveBeenCalledTimes(1);
  });

  it('invokes tracing logger hooks for requests and responses', async () => {
    fetchMock.mockResolvedValue(createTextResponse('ok'));
    const logger = vi.fn();
    const client = createHttpClient({
      fetch: fetchMock as unknown as typeof fetch,
      logger,
      trace: false,
    });

    const response: ApiRequestResult<string | null> = await client.request('https://api.example/text', {
      parseMode: 'text',
    });

    expect(response.data).toBe('ok');
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ phase: 'request', url: 'https://api.example/text' }));
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ phase: 'response', url: 'https://api.example/text' }));
  });

  it('exposes the resolved base URL when no path is provided', () => {
    const client = createHttpClient({ baseUrl: () => 'https://example.test/api/', trace: false });
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
    const client = createHttpClient({ fetch: fetchMock as unknown as typeof fetch, trace: false });

    await expect(client.requestJson('https://api.example/fail')).rejects.toBe(apiError);
  });
});
