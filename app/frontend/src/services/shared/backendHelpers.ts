import {
  createBackendClient,
  resolveBackendClient,
  type ApiRequestInit,
  type BackendClient,
} from '@/services/backendClient';
import { trimLeadingSlash } from '@/utils/backend';

export type BackendClientInput = BackendClient | string | null | undefined;

export const resolveClient = (input?: BackendClientInput): BackendClient => {
  if (typeof input === 'string') {
    return createBackendClient(input);
  }

  if (input == null) {
    return resolveBackendClient();
  }

  return resolveBackendClient(input);
};

export const withSameOrigin = (init: ApiRequestInit = {}): ApiRequestInit => ({
  credentials: 'same-origin',
  ...init,
});

const joinSegments = (segments: readonly string[]): string => {
  const parts = segments
    .map((segment) => (typeof segment === 'string' ? trimLeadingSlash(segment) : ''))
    .filter((segment) => segment.length > 0);

  if (!parts.length) {
    return '';
  }

  return `/${parts.join('/')}`;
};

export type BackendPathBuilder = (path?: string) => string;

export const createBackendPathBuilder = (basePath: string): BackendPathBuilder => {
  const base = trimLeadingSlash(basePath);
  return (path = '') => joinSegments([base, path]);
};

export const resolveBackendPath = (path: string, input?: BackendClientInput): string =>
  resolveClient(input).resolve(path);

export interface BackendPathResolver {
  path: BackendPathBuilder;
  resolve: (path?: string, input?: BackendClientInput) => string;
}

export const createBackendPathResolver = (basePath: string): BackendPathResolver => {
  const path = createBackendPathBuilder(basePath);
  const resolve = (suffix = '', input?: BackendClientInput): string =>
    resolveBackendPath(path(suffix), input);

  return { path, resolve };
};
