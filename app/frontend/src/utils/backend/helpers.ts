export const DEFAULT_BACKEND_BASE = '/api/v1';

export const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, '');

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
