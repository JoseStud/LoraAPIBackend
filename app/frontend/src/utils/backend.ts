import { computed, unref, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import { storeToRefs } from 'pinia';

import { runtimeConfig, DEFAULT_BACKEND_BASE } from '@/config/runtime';
import { useSettingsStore } from '@/stores/settings';

export { DEFAULT_BACKEND_BASE };

export const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

export const trimLeadingSlash = (value: string): string => value.replace(/^\/+/, '');

const splitPathSuffix = (input: string): { pathname: string; suffix: string } => {
  const match = input.match(/^([^?#]*)(.*)$/);
  if (!match) {
    return { pathname: input, suffix: '' };
  }
  return { pathname: match[1] ?? '', suffix: match[2] ?? '' };
};

const pickBackendBase = (override?: string | null, configured?: string | null): string => {
  const trimmedOverride = typeof override === 'string' ? override.trim() : '';
  if (trimmedOverride.length > 0) {
    return trimmedOverride;
  }

  const trimmedConfigured = typeof configured === 'string' ? configured.trim() : '';
  if (trimmedConfigured.length > 0) {
    return trimmedConfigured;
  }

  return DEFAULT_BACKEND_BASE;
};

const normaliseBackendBase = (base: string): string => {
  if (/^https?:\/\//i.test(base)) {
    return trimTrailingSlash(base);
  }

  const withoutTrailing = trimTrailingSlash(base);
  if (!withoutTrailing) {
    return DEFAULT_BACKEND_BASE;
  }

  return withoutTrailing.startsWith('/') ? withoutTrailing : `/${withoutTrailing}`;
};

const joinBackendPath = (base: string, path: string): string => {
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

const resolveMaybeRef = (
  value?: MaybeRefOrGetter<string | null>,
): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  try {
    const resolved = typeof value === 'function'
      ? (value as () => string | null | undefined)()
      : unref(value);

    if (typeof resolved === 'string') {
      return resolved;
    }

    return resolved ?? undefined;
  } catch (error) {
    if (runtimeConfig.isDev) {
      console.warn('Failed to resolve backend override', error);
    }
    return undefined;
  }
};

export const resolveBackendBaseUrl = (baseOverride?: string | null): string => {
  const settingsStore = useSettingsStore();
  const base = pickBackendBase(baseOverride, settingsStore.backendUrl);
  return normaliseBackendBase(base);
};

export const resolveBackendUrl = (path = '', baseOverride?: string | null): string => {
  const base = resolveBackendBaseUrl(baseOverride);
  if (!path) {
    return base;
  }
  return joinBackendPath(base, path);
};

export const useBackendBase = (
  baseOverride?: MaybeRefOrGetter<string | null>,
): ComputedRef<string> => {
  const settingsStore = useSettingsStore();
  const { backendUrl } = storeToRefs(settingsStore);

  return computed(() => {
    const override = resolveMaybeRef(baseOverride);
    const base = pickBackendBase(override, backendUrl.value);
    return normaliseBackendBase(base);
  });
};

const resolvePathInput = (path: MaybeRefOrGetter<string>): string => {
  try {
    const resolved = typeof path === 'function' ? (path as () => string)() : unref(path);
    return typeof resolved === 'string' ? resolved : '';
  } catch (error) {
    if (runtimeConfig.isDev) {
      console.warn('Failed to resolve backend path', error);
    }
    return '';
  }
};

export const useBackendUrl = (
  path: MaybeRefOrGetter<string>,
  baseOverride?: MaybeRefOrGetter<string | null>,
): ComputedRef<string> => {
  const backendBase = useBackendBase(baseOverride);

  return computed(() => {
    const targetPath = resolvePathInput(path);
    if (!targetPath) {
      return backendBase.value;
    }
    return joinBackendPath(backendBase.value, targetPath);
  });
};

export const createBackendUrlGetter = (
  path: MaybeRefOrGetter<string>,
  baseOverride?: MaybeRefOrGetter<string | null>,
): (() => string) => {
  const resolved = useBackendUrl(path, baseOverride);
  return () => resolved.value;
};

export const backendUtils = {
  DEFAULT_BACKEND_BASE,
  trimLeadingSlash,
  trimTrailingSlash,
  resolveBackendBaseUrl,
  resolveBackendUrl,
  useBackendBase,
  useBackendUrl,
  createBackendUrlGetter,
};

export default backendUtils;
