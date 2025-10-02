import { computed, ref, type ComputedRef } from 'vue';

import { runtimeConfig } from '@/config/runtime';
import { sanitizeBackendBaseUrl } from '@/utils/backend/helpers';

export type BackendEnvironmentValue = {
  backendUrl: string;
  backendApiKey: string | null;
  hasExplicitBackendApiKey: boolean;
};

export type BackendEnvironmentOverrides = Partial<BackendEnvironmentValue>;

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

const createDeferred = (): Deferred => {
  let resolved = false;
  let resolveFn: (() => void) | null = null;

  const promise = new Promise<void>((resolve) => {
    resolveFn = resolve;
  });

  return {
    promise,
    resolve: () => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolveFn?.();
      resolveFn = null;
    },
  };
};

export const normaliseBackendApiKey = (value?: string | null): string | null => {
  if (value == null) {
    return null;
  }
  const trimmed = `${value}`.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const runtimeDefaults = Object.freeze({
  backendUrl: sanitizeBackendBaseUrl(runtimeConfig.backendBasePath),
  backendApiKey: normaliseBackendApiKey(runtimeConfig.backendApiKey),
});

const ensureBackendUrl = (value: unknown): string => {
  if (typeof value === 'string') {
    const candidate = sanitizeBackendBaseUrl(value);
    return candidate || runtimeDefaults.backendUrl;
  }
  if (value == null) {
    return runtimeDefaults.backendUrl;
  }
  const candidate = sanitizeBackendBaseUrl(String(value));
  return candidate || runtimeDefaults.backendUrl;
};

const ensureBackendApiKey = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  return normaliseBackendApiKey(value as string | null | undefined);
};

const baseBackendUrl = ref<string>(runtimeDefaults.backendUrl);
const baseBackendApiKey = ref<string | null>(runtimeDefaults.backendApiKey ?? null);
const baseBackendApiKeyExplicit = ref<boolean>(runtimeDefaults.backendApiKey != null);

const overrides = ref<BackendEnvironmentOverrides | null>(null);

const resolvedBackendUrl = computed<string>(() => {
  const currentOverrides = overrides.value;
  if (currentOverrides && Object.prototype.hasOwnProperty.call(currentOverrides, 'backendUrl')) {
    return ensureBackendUrl(currentOverrides.backendUrl);
  }
  return baseBackendUrl.value;
});

const resolvedBackendApiKey = computed<string | null>(() => {
  const currentOverrides = overrides.value;
  if (currentOverrides && Object.prototype.hasOwnProperty.call(currentOverrides, 'backendApiKey')) {
    return ensureBackendApiKey(currentOverrides.backendApiKey);
  }
  return baseBackendApiKey.value;
});

const resolvedHasExplicitBackendApiKey = computed<boolean>(() => {
  const currentOverrides = overrides.value;
  if (currentOverrides && Object.prototype.hasOwnProperty.call(currentOverrides, 'hasExplicitBackendApiKey')) {
    return Boolean(currentOverrides.hasExplicitBackendApiKey);
  }
  if (currentOverrides && Object.prototype.hasOwnProperty.call(currentOverrides, 'backendApiKey')) {
    return true;
  }
  return baseBackendApiKeyExplicit.value;
});

const readiness = createDeferred();
Promise.resolve().then(() => {
  readiness.resolve();
});

export const backendEnvironmentReadyPromise = readiness.promise;

export const publishBackendEnvironment = (value: BackendEnvironmentValue): BackendEnvironmentValue => {
  baseBackendUrl.value = ensureBackendUrl(value.backendUrl);
  baseBackendApiKey.value = ensureBackendApiKey(value.backendApiKey);
  baseBackendApiKeyExplicit.value = Boolean(value.hasExplicitBackendApiKey);
  readiness.resolve();
  return getBackendEnvironmentSnapshot();
};

export const resetBackendEnvironment = (): BackendEnvironmentValue => {
  baseBackendUrl.value = runtimeDefaults.backendUrl;
  baseBackendApiKey.value = runtimeDefaults.backendApiKey ?? null;
  baseBackendApiKeyExplicit.value = runtimeDefaults.backendApiKey != null;
  overrides.value = null;
  readiness.resolve();
  return getBackendEnvironmentSnapshot();
};

export const setBackendEnvironmentOverrides = (
  overrideValue: BackendEnvironmentOverrides | null | undefined,
): BackendEnvironmentValue => {
  if (overrideValue && typeof overrideValue === 'object') {
    const nextOverrides: BackendEnvironmentOverrides = {};
    if (Object.prototype.hasOwnProperty.call(overrideValue, 'backendUrl')) {
      nextOverrides.backendUrl = ensureBackendUrl(overrideValue.backendUrl);
    }
    if (Object.prototype.hasOwnProperty.call(overrideValue, 'backendApiKey')) {
      nextOverrides.backendApiKey = ensureBackendApiKey(overrideValue.backendApiKey);
    }
    if (Object.prototype.hasOwnProperty.call(overrideValue, 'hasExplicitBackendApiKey')) {
      nextOverrides.hasExplicitBackendApiKey = Boolean(overrideValue.hasExplicitBackendApiKey);
    } else if (Object.prototype.hasOwnProperty.call(overrideValue, 'backendApiKey')) {
      nextOverrides.hasExplicitBackendApiKey = true;
    }
    overrides.value = nextOverrides;
  } else {
    overrides.value = null;
  }
  readiness.resolve();
  return getBackendEnvironmentSnapshot();
};

export const clearBackendEnvironmentOverrides = (): BackendEnvironmentValue => {
  overrides.value = null;
  readiness.resolve();
  return getBackendEnvironmentSnapshot();
};

export const getBackendEnvironmentSnapshot = (): BackendEnvironmentValue => ({
  backendUrl: resolvedBackendUrl.value,
  backendApiKey: resolvedBackendApiKey.value,
  hasExplicitBackendApiKey: resolvedHasExplicitBackendApiKey.value,
});

export interface BackendEnvironmentBinding {
  readyPromise: Promise<void>;
  backendUrl: ComputedRef<string>;
  backendApiKey: ComputedRef<string | null>;
  hasExplicitBackendApiKey: ComputedRef<boolean>;
}

export const useBackendEnvironment = (): BackendEnvironmentBinding => ({
  readyPromise: backendEnvironmentReadyPromise,
  backendUrl: resolvedBackendUrl,
  backendApiKey: resolvedBackendApiKey,
  hasExplicitBackendApiKey: resolvedHasExplicitBackendApiKey,
});

export const withBackendEnvironmentOverrides = async <T>(
  overrideValue: BackendEnvironmentOverrides | null | undefined,
  callback: () => T | Promise<T>,
): Promise<T> => {
  const previous = overrides.value;
  setBackendEnvironmentOverrides(overrideValue);
  try {
    return await callback();
  } finally {
    overrides.value = previous;
  }
};

export const getRuntimeBackendDefaults = (): BackendEnvironmentValue => ({
  backendUrl: runtimeDefaults.backendUrl,
  backendApiKey: runtimeDefaults.backendApiKey ?? null,
  hasExplicitBackendApiKey: runtimeDefaults.backendApiKey != null,
});
