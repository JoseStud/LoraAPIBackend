import { computed, isRef, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';

import {
  useBackendRefresh,
  type BackendRefreshOptions,
  type BackendRefreshSubscription,
} from '@/services';

export interface AsyncResourceBackendRefreshOptions<TArgs>
  extends BackendRefreshOptions {
  /**
   * When provided, determines whether backend refresh triggers should execute the refresh callback.
   */
  enabled?: Ref<boolean> | boolean | (() => boolean);
  /**
   * Resolves the arguments that should be passed to the refresh handler when triggered by backend
   * changes. Defaults to the most recent arguments supplied to the resource.
   */
  getArgs?: () => TArgs | undefined;
}

export interface UseAsyncResourceOptions<TArgs, TResult> {
  /**
   * Initial arguments used before the first explicit fetch.
   */
  initialArgs?: TArgs;
  /**
   * Initial data value assigned to the resource.
   */
  initialValue?: TResult | null;
  /**
   * Custom cache key resolver used to determine whether two argument sets are equivalent.
   */
  getKey?: (args: TArgs | undefined) => unknown;
  /**
   * Custom staleness predicate to determine whether a cached response should be refreshed.
   */
  isStale?: (context: {
    lastLoadedAt: number | null;
    lastArgs: TArgs | undefined;
    nextArgs: TArgs | undefined;
  }) => boolean;
  /**
   * When true, the resource will execute an immediate refresh using the initial arguments.
   */
  immediate?: boolean;
  /**
   * Enables backend refresh integration. When `true`, default options are used. When an object is
   * provided, the helper will be configured with the supplied backend refresh options.
   */
  backendRefresh?: boolean | AsyncResourceBackendRefreshOptions<TArgs>;
  /**
   * Invoked after the fetcher resolves successfully. Receives the resolved arguments for the
   * request.
   */
  onSuccess?: (result: TResult, context: { args: TArgs }) => void;
  /**
   * Invoked when the fetcher throws an error. Receives the arguments used for the request.
   */
  onError?: (error: unknown, context: { args: TArgs }) => void;
}

export interface AsyncResourceResult<TArgs, TResult> {
  data: Ref<TResult | null>;
  error: Ref<unknown>;
  isLoading: Ref<boolean>;
  lastLoadedAt: Ref<number | null>;
  isLoaded: ComputedRef<boolean>;
  lastArgs: Ref<TArgs | undefined>;
  ensureLoaded: (args?: TArgs) => Promise<TResult | null>;
  refresh: (args?: TArgs) => Promise<TResult | null>;
  invalidate: () => void;
  setData: (value: TResult | null, options?: { markLoaded?: boolean; args?: TArgs }) => void;
  mutate: (
    updater: (current: TResult | null) => TResult | null,
    options?: { markLoaded?: boolean; args?: TArgs },
  ) => TResult | null;
  setError: (value: unknown) => void;
  clearError: () => void;
  reset: () => void;
  backendRefresh?: BackendRefreshSubscription | null;
}

const resolveKey = <TArgs>(
  args: TArgs | undefined,
  resolver?: (args: TArgs | undefined) => unknown,
): unknown => {
  if (resolver) {
    return resolver(args);
  }

  try {
    return JSON.stringify(args ?? null);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[useAsyncResource] Failed to serialise arguments for cache key', error);
    }
    return args as unknown;
  }
};

const resolveEnabled = (input?: Ref<boolean> | boolean | (() => boolean)): boolean => {
  if (typeof input === 'function') {
    return Boolean(input());
  }

  if (isRef(input)) {
    return Boolean(input.value);
  }

  if (typeof input === 'boolean') {
    return input;
  }

  return true;
};

export const useAsyncResource = <TResult, TArgs = void>(
  fetcher: (args: TArgs) => Promise<TResult>,
  options: UseAsyncResourceOptions<TArgs, TResult> = {},
): AsyncResourceResult<TArgs, TResult> => {
  const {
    initialArgs,
    initialValue = null,
    getKey,
    isStale,
    immediate = false,
    backendRefresh: backendRefreshOptions = false,
    onSuccess,
    onError,
  } = options;

  const initialDataValue = initialValue ?? null;
  const data = ref(initialDataValue) as Ref<TResult | null>;
  const error: Ref<unknown> = ref<unknown>(null);
  const isLoading: Ref<boolean> = ref(false);
  const lastLoadedAt: Ref<number | null> = ref(null);
  const lastArgs = ref(initialArgs) as Ref<TArgs | undefined>;

  let pending: Promise<TResult> | null = null;
  let pendingKey: unknown | null = null;
  let currentRequestId = 0;
  let lastKey: unknown = resolveKey(initialArgs, getKey);

  const ensureArgs = (args?: TArgs): TArgs => {
    if (args !== undefined) {
      return args;
    }
    if (lastArgs.value !== undefined) {
      return lastArgs.value;
    }
    if (initialArgs !== undefined) {
      return initialArgs;
    }
    return undefined as unknown as TArgs;
  };

  const runFetch = (args?: TArgs): Promise<TResult> => {
    const nextArgs = ensureArgs(args);
    const requestKey = resolveKey(nextArgs, getKey);

    if (pending && requestKey === pendingKey) {
      return pending;
    }

    const requestId = ++currentRequestId;
    pendingKey = requestKey;

    const requestPromise = (async () => {
      isLoading.value = true;
      error.value = null;

      try {
        const result = await fetcher(nextArgs);
        if (requestId === currentRequestId) {
          data.value = result;
          lastArgs.value = nextArgs;
          lastKey = requestKey;
          lastLoadedAt.value = Date.now();
          onSuccess?.(result, { args: nextArgs });
        }
        return result;
      } catch (err) {
        if (requestId === currentRequestId) {
          error.value = err;
          onError?.(err, { args: nextArgs });
        }
        throw err;
      } finally {
        if (requestId === currentRequestId) {
          isLoading.value = false;
          pending = null;
          pendingKey = null;
        }
      }
    })();

    pending = requestPromise;

    requestPromise.finally(() => {
      if (requestId !== currentRequestId && pending === requestPromise) {
        pending = null;
        pendingKey = null;
      }
    });

    return requestPromise;
  };

  const refresh = async (args?: TArgs): Promise<TResult | null> => {
    const result = await runFetch(args);
    return result ?? data.value;
  };

  const ensureLoaded = async (args?: TArgs): Promise<TResult | null> => {
    const targetArgs = ensureArgs(args);
    const targetKey = resolveKey(targetArgs, getKey);

    if (pending && pendingKey === targetKey) {
      await pending;
      return data.value;
    }

    const hasLoaded = lastLoadedAt.value != null;
    const needsRefresh =
      !hasLoaded
      || targetKey !== lastKey
      || Boolean(
        isStale?.({
          lastLoadedAt: lastLoadedAt.value,
          lastArgs: lastArgs.value,
          nextArgs: targetArgs,
        }),
      );

    if (needsRefresh) {
      await runFetch(targetArgs);
    }

    return data.value;
  };

  const invalidate = () => {
    lastLoadedAt.value = null;
  };

  const setData = (
    value: TResult | null,
    { markLoaded = false, args }: { markLoaded?: boolean; args?: TArgs } = {},
  ) => {
    data.value = value;
    if (markLoaded) {
      lastLoadedAt.value = Date.now();
      if (args !== undefined) {
        lastArgs.value = args;
        lastKey = resolveKey(args, getKey);
      }
    }
  };

  const mutate = (
    updater: (current: TResult | null) => TResult | null,
    { markLoaded = true, args }: { markLoaded?: boolean; args?: TArgs } = {},
  ): TResult | null => {
    const nextValue = updater(data.value);
    setData(nextValue, { markLoaded, args });
    return nextValue;
  };

  const setError = (value: unknown) => {
    error.value = value;
  };

  const clearError = () => {
    error.value = null;
  };

  const reset = () => {
    pending = null;
    pendingKey = null;
    currentRequestId = 0;
    isLoading.value = false;
    error.value = null;
    data.value = initialDataValue;
    lastArgs.value = initialArgs;
    lastKey = resolveKey(initialArgs, getKey);
    lastLoadedAt.value = null;
  };

  let backendRefresh: BackendRefreshSubscription | null = null;

  if (backendRefreshOptions) {
    const refreshOptions: AsyncResourceBackendRefreshOptions<TArgs> =
      typeof backendRefreshOptions === 'boolean' ? {} : backendRefreshOptions;

    backendRefresh = useBackendRefresh(() => {
      if (!resolveEnabled(refreshOptions.enabled)) {
        return;
      }
      const args = refreshOptions.getArgs?.();
      void refresh(args);
    }, refreshOptions);
  }

  if (immediate) {
    void refresh(initialArgs);
  }

  onScopeDispose(() => {
    pending = null;
    pendingKey = null;
  });

  return {
    data,
    error,
    isLoading,
    lastLoadedAt,
    isLoaded: computed(() => lastLoadedAt.value != null),
    lastArgs,
    ensureLoaded,
    refresh,
    invalidate,
    setData,
    mutate,
    setError,
    clearError,
    reset,
    backendRefresh,
  } satisfies AsyncResourceResult<TArgs, TResult>;
};

export type UseAsyncResourceReturn<TArgs, TResult> = ReturnType<
  typeof useAsyncResource<TResult, TArgs>
>;
