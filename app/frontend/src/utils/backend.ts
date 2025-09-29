import { computed, unref, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import { storeToRefs } from 'pinia';

import { useSettingsStore } from '@/stores';

import {
  DEFAULT_BACKEND_BASE,
  joinBackendPath,
  normaliseBackendBase,
  sanitizeBackendBaseUrl,
  trimLeadingSlash,
  trimTrailingSlash,
  resolveGenerationRoute,
} from './backend/helpers';

export {
  DEFAULT_BACKEND_BASE,
  joinBackendPath,
  normaliseBackendBase,
  resolveGenerationRoute,
  sanitizeBackendBaseUrl,
  trimLeadingSlash,
  trimTrailingSlash,
};

const isDev = import.meta.env.DEV ?? false;

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
    if (isDev) {
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
    if (isDev) {
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
  joinBackendPath,
  normaliseBackendBase,
  resolveGenerationRoute,
  trimLeadingSlash,
  trimTrailingSlash,
  sanitizeBackendBaseUrl,
  resolveBackendBaseUrl,
  resolveBackendUrl,
  useBackendBase,
  useBackendUrl,
  createBackendUrlGetter,
};

export default backendUtils;
