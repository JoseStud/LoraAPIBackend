import {
  createBackendClient,
  resolveBackendClient,
  type BackendClient,
} from '@/services/backendClient';
import {
  createBackendPathBuilder,
  type BackendPathBuilder,
  withSameOrigin,
} from '@/utils/backend';

export type BackendClientInput = BackendClient | string | null | undefined;

export type { BackendPathBuilder };

export const resolveClient = (input?: BackendClientInput): BackendClient => {
  if (typeof input === 'string') {
    return createBackendClient(input);
  }

  if (input == null) {
    return resolveBackendClient();
  }

  return resolveBackendClient(input);
};

export { withSameOrigin };

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
