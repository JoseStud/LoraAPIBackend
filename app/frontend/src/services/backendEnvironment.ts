import { computed, ref, type ComputedRef } from 'vue';

import { runtimeConfig } from '@/config/runtime';
import { normalizeBackendConfig } from '@/shared/config/backendConfig';

export type BackendEnvironmentValue = {
  backendUrl: string;
  backendApiKey: string | null;
  hasExplicitBackendApiKey: boolean;
};

export type BackendEnvironmentOverrides = Partial<BackendEnvironmentValue>;

const createStaleReadyPromiseError = (epoch: number): Error =>
  new Error(`Backend environment readiness promise superseded by a newer update (epoch ${epoch}).`);

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  isSettled: () => boolean;
};

const createDeferred = (): Deferred => {
  let settled = false;
  let resolveFn: (() => void) | null = null;
  let rejectFn: ((reason?: unknown) => void) | null = null;

  const promise = new Promise<void>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });

  return {
    promise,
    resolve: () => {
      if (settled) {
        return;
      }
      settled = true;
      resolveFn?.();
      resolveFn = null;
      rejectFn = null;
    },
    reject: (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      rejectFn?.(error ?? createStaleReadyPromiseError(0));
      resolveFn = null;
      rejectFn = null;
    },
    isSettled: () => settled,
  };
};

const runtimeNormalized = normalizeBackendConfig({
  baseURL: runtimeConfig.backendBasePath,
  apiKey: runtimeConfig.backendApiKey,
});

const runtimeDefaults: BackendEnvironmentValue = Object.freeze({
  backendUrl: runtimeNormalized.baseURL,
  backendApiKey: runtimeNormalized.apiKey,
  hasExplicitBackendApiKey: runtimeNormalized.apiKey != null,
});

const baseBackendUrl = ref<string>(runtimeDefaults.backendUrl);
const baseBackendApiKey = ref<string | null>(runtimeDefaults.backendApiKey);
const baseBackendApiKeyExplicit = ref<boolean>(runtimeDefaults.hasExplicitBackendApiKey);

const overrides = ref<BackendEnvironmentOverrides | null>(null);

const resolvedBackendUrl = computed<string>(() => {
  const currentOverrides = overrides.value;
  if (currentOverrides && Object.prototype.hasOwnProperty.call(currentOverrides, 'backendUrl')) {
    return (currentOverrides.backendUrl as string | undefined) ?? runtimeDefaults.backendUrl;
  }
  return baseBackendUrl.value;
});

const resolvedBackendApiKey = computed<string | null>(() => {
  const currentOverrides = overrides.value;
  if (currentOverrides && Object.prototype.hasOwnProperty.call(currentOverrides, 'backendApiKey')) {
    return (currentOverrides.backendApiKey as string | null | undefined) ?? null;
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

let readinessEpoch = 0;
let readiness = createDeferred();
export let backendEnvironmentReadyPromise = readiness.promise;

const beginEnvironmentUpdate = () => {
  if (!readiness.isSettled()) {
    readiness.reject(createStaleReadyPromiseError(readinessEpoch));
  }
  readinessEpoch += 1;
  readiness = createDeferred();
  backendEnvironmentReadyPromise = readiness.promise;
};

const completeEnvironmentUpdate = () => {
  queueMicrotask(() => {
    readiness.resolve();
  });
};

completeEnvironmentUpdate();

export const normaliseBackendApiKey = (value?: string | null): string | null => {
  const { apiKey } = normalizeBackendConfig({ apiKey: value });
  return apiKey;
};

const applyBaseEnvironment = (value: BackendEnvironmentValue) => {
  const normalised = normalizeBackendConfig({
    baseURL: value.backendUrl,
    apiKey: value.backendApiKey,
  });
  baseBackendUrl.value = normalised.baseURL;
  baseBackendApiKey.value = normalised.apiKey;
  baseBackendApiKeyExplicit.value = Boolean(value.hasExplicitBackendApiKey);
};

export const publishBackendEnvironment = (value: BackendEnvironmentValue): BackendEnvironmentValue => {
  beginEnvironmentUpdate();
  applyBaseEnvironment(value);
  completeEnvironmentUpdate();
  return getBackendEnvironmentSnapshot();
};

export const resetBackendEnvironment = (): BackendEnvironmentValue => {
  beginEnvironmentUpdate();
  baseBackendUrl.value = runtimeDefaults.backendUrl;
  baseBackendApiKey.value = runtimeDefaults.backendApiKey;
  baseBackendApiKeyExplicit.value = runtimeDefaults.hasExplicitBackendApiKey;
  overrides.value = null;
  completeEnvironmentUpdate();
  return getBackendEnvironmentSnapshot();
};

export const setBackendEnvironmentOverrides = (
  overrideValue: BackendEnvironmentOverrides | null | undefined,
): BackendEnvironmentValue => {
  beginEnvironmentUpdate();
  if (overrideValue && typeof overrideValue === 'object') {
    const nextOverrides: BackendEnvironmentOverrides = {};
    const hasBackendUrl = Object.prototype.hasOwnProperty.call(overrideValue, 'backendUrl');
    const hasBackendApiKey = Object.prototype.hasOwnProperty.call(overrideValue, 'backendApiKey');

    if (hasBackendUrl || hasBackendApiKey) {
      const normalised = normalizeBackendConfig({
        baseURL: hasBackendUrl ? overrideValue.backendUrl : resolvedBackendUrl.value,
        apiKey: hasBackendApiKey ? overrideValue.backendApiKey : resolvedBackendApiKey.value,
      });
      if (hasBackendUrl) {
        nextOverrides.backendUrl = normalised.baseURL;
      }
      if (hasBackendApiKey) {
        nextOverrides.backendApiKey = normalised.apiKey;
      }
    }

    if (Object.prototype.hasOwnProperty.call(overrideValue, 'hasExplicitBackendApiKey')) {
      nextOverrides.hasExplicitBackendApiKey = Boolean(overrideValue.hasExplicitBackendApiKey);
    } else if (hasBackendApiKey) {
      nextOverrides.hasExplicitBackendApiKey = true;
    }

    overrides.value = nextOverrides;
  } else {
    overrides.value = null;
  }
  completeEnvironmentUpdate();
  return getBackendEnvironmentSnapshot();
};

export const clearBackendEnvironmentOverrides = (): BackendEnvironmentValue => {
  beginEnvironmentUpdate();
  overrides.value = null;
  completeEnvironmentUpdate();
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
  get readyPromise() {
    return backendEnvironmentReadyPromise;
  },
  backendUrl: resolvedBackendUrl,
  backendApiKey: resolvedBackendApiKey,
  hasExplicitBackendApiKey: resolvedHasExplicitBackendApiKey,
});

export const withBackendEnvironmentOverrides = async <T>(
  overrideValue: BackendEnvironmentOverrides | null | undefined,
  callback: () => T | Promise<T>,
): Promise<T> => {
  const previous = overrides.value ? { ...overrides.value } : null;
  setBackendEnvironmentOverrides(overrideValue);
  try {
    return await callback();
  } finally {
    setBackendEnvironmentOverrides(previous);
  }
};

export const getRuntimeBackendDefaults = (): BackendEnvironmentValue => ({
  backendUrl: runtimeDefaults.backendUrl,
  backendApiKey: runtimeDefaults.backendApiKey,
  hasExplicitBackendApiKey: runtimeDefaults.hasExplicitBackendApiKey,
});
