import { computed, unref, type ComputedRef, type MaybeRefOrGetter } from 'vue';
import { storeToRefs } from 'pinia';

import {
  getResolvedBackendUrl,
  tryGetSettingsStore,
  type SettingsStore,
} from '@/stores/settings';

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

const resolveConfiguredBackendBase = (settingsStore?: SettingsStore | null): string => {
  if (settingsStore) {
    return settingsStore.backendUrl;
  }
  return getResolvedBackendUrl();
};

export const resolveBackendBaseUrl = (
  baseOverride?: string | null,
  settingsStore?: SettingsStore | null,
): string => {
  const base = pickBackendBase(baseOverride, resolveConfiguredBackendBase(settingsStore));
  return normaliseBackendBase(base);
};

export const resolveBackendUrl = (
  path = '',
  baseOverride?: string | null,
  settingsStore?: SettingsStore | null,
): string => {
  const base = resolveBackendBaseUrl(baseOverride, settingsStore);
  if (!path) {
    return base;
  }
  return joinBackendPath(base, path);
};

export const useBackendBase = (
  baseOverride?: MaybeRefOrGetter<string | null>,
): ComputedRef<string> => {
  const settingsStore = tryGetSettingsStore();
  const backendUrl = settingsStore ? storeToRefs(settingsStore).backendUrl : null;
  const fallbackBase = settingsStore ? null : resolveConfiguredBackendBase(null);

  return computed(() => {
    const override = resolveMaybeRef(baseOverride);
    const configuredBase = backendUrl ? backendUrl.value : fallbackBase ?? getResolvedBackendUrl();
    const base = pickBackendBase(override, configuredBase);
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
