import type { ApiRequestInit } from '@/services/apiClient';

export const DEFAULT_BACKEND_BASE = '/api/v1';

export const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, '');

const normalisePathSegment = (segment: string): string => {
  const trimmed = segment.trim();
  return trimTrailingSlash(trimLeadingSlash(trimmed));
};

export const normaliseBackendBase = (base: string): string => {
  if (/^https?:\/\//i.test(base)) {
    return trimTrailingSlash(base);
  }

  const withoutTrailing = trimTrailingSlash(base);
  if (!withoutTrailing) {
    return DEFAULT_BACKEND_BASE;
  }

  return withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;
};

export const sanitizeBackendBaseUrl = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return DEFAULT_BACKEND_BASE;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_BACKEND_BASE;
  }

  return normaliseBackendBase(trimmed);
};

type BackendPathSegment = string | null | undefined;

export const joinBackendSegments = (
  ...segments: readonly BackendPathSegment[]
): string => {
  let result = '';

  for (const segment of segments) {
    if (typeof segment !== 'string') {
      continue;
    }

    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith('?') || trimmed.startsWith('#')) {
      result = `${result}${trimmed}`;
      continue;
    }

    const normalised = normalisePathSegment(trimmed);
    if (!normalised) {
      continue;
    }

    if (!result) {
      result = `/${normalised}`;
      continue;
    }

    const base = result.endsWith('/') ? result.slice(0, -1) : result;
    result = `${base}/${normalised}`;
  }

  return result;
};

export type BackendPathBuilder = (path?: string) => string;

export const createBackendPathBuilder = (basePath: string): BackendPathBuilder => {
  const baseSegment = normalisePathSegment(basePath);

  return (path?: string) => {
    const nextSegment = typeof path === 'string' ? path : '';
    if (!nextSegment.trim()) {
      return baseSegment ? `/${baseSegment}` : '';
    }

    const joined = joinBackendSegments(baseSegment, nextSegment);
    return joined || (baseSegment ? `/${baseSegment}` : '');
  };
};

export const withSameOrigin = <T extends RequestInit = ApiRequestInit>(init?: T): T =>
  ({
    credentials: 'same-origin',
    ...(init ?? {}),
  }) as T;

const splitPathSuffix = (input: string): { pathname: string; suffix: string } => {
  const match = input.match(/^([^?#]*)(.*)$/);
  if (!match) {
    return { pathname: input, suffix: '' };
  }
  return { pathname: match[1] ?? '', suffix: match[2] ?? '' };
};

export const joinBackendPath = (base: string, path: string): string => {
  const { pathname, suffix } = splitPathSuffix(path);
  const normalisedBase = trimTrailingSlash(base);
  const normalisedPathname = trimLeadingSlash(pathname);

  if (!normalisedPathname) {
    return normalisedBase || DEFAULT_BACKEND_BASE;
  }

  if (!normalisedBase) {
    return `/${normalisedPathname}${suffix}`;
  }

  const combined = /^https?:\/\//i.test(normalisedBase)
    ? `${normalisedBase}/${normalisedPathname}`
    : `${normalisedBase}/${normalisedPathname}`.replace(/^\/+/, '/');

  return `${combined}${suffix}`;
};

export const resolveGenerationRoute = (path = ''): string => {
  const trimmed = trimLeadingSlash(path);
  return `/generation${trimmed ? `/${trimmed}` : ''}`;
};
