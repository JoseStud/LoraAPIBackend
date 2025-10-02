import { createHttpClient, type CreateHttpClientConfig, type HttpClient } from './createHttpClient';
import { resolveBackendBaseUrl } from '@/utils/backend';

export type BackendHttpClientInput = HttpClient | string | null | undefined;

export interface BackendHttpClientOptions extends Omit<CreateHttpClientConfig, 'baseURL'> {
  baseURL?: string | (() => string | null | undefined);
}

const normaliseBaseResolver = (
  baseURL?: BackendHttpClientOptions['baseURL'],
): (() => string | null) => {
  if (typeof baseURL === 'function') {
    return () => {
      try {
        const resolved = baseURL();
        if (typeof resolved === 'string' && resolved.trim()) {
          return resolveBackendBaseUrl(resolved);
        }
        return resolved ?? resolveBackendBaseUrl();
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[http] Failed to resolve backend base override', error);
        }
        return resolveBackendBaseUrl();
      }
    };
  }

  if (typeof baseURL === 'string' && baseURL.trim()) {
    return () => resolveBackendBaseUrl(baseURL);
  }

  return () => resolveBackendBaseUrl();
};

export const createBackendHttpClient = (options: BackendHttpClientOptions = {}): HttpClient => {
  const { baseURL, ...rest } = options;
  const resolveBase = normaliseBaseResolver(baseURL);

  return createHttpClient({
    ...rest,
    baseURL: resolveBase,
  });
};
