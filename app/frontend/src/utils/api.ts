import { useApi } from '@/composables/useApi';
import type { ApiResponseMeta } from '@/composables/useApi';

export interface ApiResult<T> {
  data: T | null;
  meta: ApiResponseMeta;
}

function ensureHeaders(init?: HeadersInit): Headers {
  return new Headers(init ?? {});
}

function createJsonInit(method: string, body: unknown, options: RequestInit = {}): RequestInit {
  const headers = ensureHeaders(options.headers);
  if (!(body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const payload = body instanceof FormData ? body : JSON.stringify(body);

  return {
    ...options,
    method,
    headers,
    body: payload,
  };
}

async function executeRequest<T>(url: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  const { fetchData, data, lastResponse } = useApi<T>(url, options);
  await fetchData();
  const meta: ApiResponseMeta = lastResponse.value ?? { ok: true, status: 200, statusText: 'OK' };
  return { data: data.value as T | null, meta };
}

export async function requestJson<T>(url: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  return executeRequest<T>(url, options);
}

export async function getJson<T>(url: string, options: RequestInit = {}): Promise<ApiResult<T>> {
  return requestJson<T>(url, { ...options, method: 'GET' });
}

export async function postJson<TResponse, TBody>(
  url: string,
  body: TBody,
  options: RequestInit = {}
): Promise<ApiResult<TResponse>> {
  return requestJson<TResponse>(url, createJsonInit('POST', body, options));
}

export async function putJson<TResponse, TBody>(
  url: string,
  body: TBody,
  options: RequestInit = {}
): Promise<ApiResult<TResponse>> {
  return requestJson<TResponse>(url, createJsonInit('PUT', body, options));
}

export async function patchJson<TResponse, TBody>(
  url: string,
  body: TBody,
  options: RequestInit = {}
): Promise<ApiResult<TResponse>> {
  return requestJson<TResponse>(url, createJsonInit('PATCH', body, options));
}

export async function deleteRequest<TResponse = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<ApiResult<TResponse>> {
  return requestJson<TResponse>(url, { ...options, method: 'DELETE' });
}

export interface BlobResult {
  blob: Blob;
  response: Response;
}

export async function requestBlob(url: string, options: RequestInit = {}): Promise<BlobResult> {
  const response = await fetch(url, { credentials: 'same-origin', ...options });
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  const blob = await response.blob();
  return { blob, response };
}

export function ensureData<T>(result: ApiResult<T>): T {
  if (result.data == null) {
    throw new Error('Request did not return a response body');
  }
  return result.data;
}

export function getFilenameFromContentDisposition(header?: string | null): string | null {
  if (!header) {
    return null;
  }

  const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const asciiMatch = header.match(/filename="?([^";]+)"?/i);
  if (asciiMatch?.[1]) {
    return asciiMatch[1];
  }

  return null;
}

