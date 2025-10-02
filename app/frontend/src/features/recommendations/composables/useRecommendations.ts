import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useAsyncResource } from '@/composables/shared';

import { useSettingsStore } from '@/stores/settings';
import { useBackendEnvironment } from '@/services/backendEnvironment';
import { useAdapterCatalogStore } from '@/features/lora/public';
import {
  buildSimilarRecommendationsPath,
  getRecommendations,
  type SimilarRecommendationsQuery,
} from '@/features/recommendations/services';
import type { AdapterSummary, RecommendationItem } from '@/types';
import { debounce, type DebouncedFunction } from '@/utils/async';

const WEIGHT_KEYS = ['semantic', 'artistic', 'technical'] as const;
type WeightKey = (typeof WEIGHT_KEYS)[number];
export type WeightState = Record<WeightKey, number>;

const DEFAULT_WEIGHTS: Readonly<WeightState> = {
  semantic: 0.6,
  artistic: 0.3,
  technical: 0.1,
} as const satisfies WeightState;

export interface UseRecommendationsOptions {
  initialLimit?: number;
  initialThreshold?: number;
  initialWeights?: Partial<WeightState>;
  initialLoraId?: AdapterSummary['id'];
}

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return fallback;
};

const unwrapMaybeRef = <T>(input: T | Ref<T>): T => {
  if (typeof input === 'object' && input !== null && 'value' in input) {
    return (input as Ref<T>).value;
  }
  return input as T;
};

interface RecommendationFetchArgs {
  loraId: AdapterSummary['id'];
  limit: number;
  similarityThreshold: number;
  weights: WeightState;
}

const toQuery = (args: RecommendationFetchArgs): SimilarRecommendationsQuery => ({
  limit: args.limit,
  similarityThreshold: args.similarityThreshold,
  weights: { ...args.weights },
});

export const useRecommendations = (options: UseRecommendationsOptions = {}) => {
  const settingsStore = useSettingsStore();
  const backendEnvironment = useBackendEnvironment();

  const catalogStore = useAdapterCatalogStore();
  const loras = computed<AdapterSummary[]>(() => {
    const adapters = unwrapMaybeRef(catalogStore.adapters);
    return Array.isArray(adapters) ? adapters : [];
  });
  const catalogError = computed(() => unwrapMaybeRef(catalogStore.error));
  const catalogIsLoading = computed(() => Boolean(unwrapMaybeRef(catalogStore.isLoading)));
  const { isLoaded: settingsLoaded } = storeToRefs(settingsStore);

  const lorasError = computed<string>(() =>
    catalogError.value ? toErrorMessage(catalogError.value, 'Unable to load available LoRAs') : '',
  );

  const selectedLoraId = ref<AdapterSummary['id'] | ''>(options.initialLoraId ?? '');
  const selectedLora = computed<AdapterSummary | null>(() => {
    if (!selectedLoraId.value) {
      return null;
    }
    return loras.value.find((lora) => lora.id === selectedLoraId.value) ?? null;
  });

  const limit = ref<number>(options.initialLimit ?? 10);
  const similarityThreshold = ref<number>(options.initialThreshold ?? 0.1);
  const weights = ref<WeightState>({ ...DEFAULT_WEIGHTS, ...(options.initialWeights ?? {}) });

  const hydrationReady = ref(false);
  void backendEnvironment.ensureReady().then(() => {
    hydrationReady.value = true;
  });

  const isHydrated = computed<boolean>(() => hydrationReady.value && settingsLoaded.value);

  const resolveFetchArgs = (): RecommendationFetchArgs | null => {
    if (!selectedLoraId.value) {
      return null;
    }
    return {
      loraId: selectedLoraId.value,
      limit: limit.value,
      similarityThreshold: similarityThreshold.value,
      weights: { ...weights.value },
    } satisfies RecommendationFetchArgs;
  };

  const recommendationPath = computed<string | null>(() => {
    if (!selectedLoraId.value) {
      return null;
    }
    const args = resolveFetchArgs();
    if (!args) {
      return null;
    }
    return buildSimilarRecommendationsPath(args.loraId, toQuery(args));
  });

  let pendingController: AbortController | null = null;

  const cancelPendingRequest = () => {
    if (pendingController) {
      pendingController.abort();
      pendingController = null;
    }
  };

  const recommendationResource = useAsyncResource<RecommendationItem[], RecommendationFetchArgs>(
    async (args) => {
      cancelPendingRequest();
      const controller = new AbortController();
      pendingController = controller;
      try {
        const response = await getRecommendations({
          loraId: args.loraId,
          limit: args.limit,
          similarityThreshold: args.similarityThreshold,
          weights: { ...args.weights },
          signal: controller.signal,
        });
        return response.recommendations;
      } finally {
        if (pendingController === controller) {
          pendingController = null;
        }
      }
    },
    {
      initialValue: [],
      getKey: (value) => {
        if (!value) {
          return '';
        }
        return JSON.stringify({
          loraId: value.loraId,
          limit: value.limit,
          similarityThreshold: value.similarityThreshold,
          weights: value.weights,
        });
      },
      backendRefresh: {
        enabled: () => Boolean(selectedLora.value),
        getArgs: () => resolveFetchArgs() ?? undefined,
      },
      onError: (err, { args }) => {
        if (import.meta.env.DEV) {
          console.error('[recommendations] Failed to fetch recommendations', err, args);
        }
      },
    },
  );

  onScopeDispose(() => {
    cancelPendingRequest();
  });

  const recommendations = computed<RecommendationItem[]>(() => recommendationResource.data.value ?? []);
  const error = ref('');
  const isLoading = computed<boolean>(() => recommendationResource.isLoading.value);

  const clearRecommendations = () => {
    cancelPendingRequest();
    recommendationResource.setData([], { markLoaded: false });
    recommendationResource.clearError();
    error.value = '';
  };

  const fetchRecommendations = async (): Promise<RecommendationItem[]> => {
    if (!selectedLora.value || !isHydrated.value) {
      clearRecommendations();
      return [];
    }

    const args = resolveFetchArgs();
    if (!args) {
      clearRecommendations();
      return [];
    }

    try {
      const payload = await recommendationResource.refresh(args);
      error.value = '';
      return payload ?? [];
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to fetch recommendations');
      return recommendations.value;
    }
  };

  const debouncedFetchRecommendations: DebouncedFunction<() => void> = debounce(
    () => {
      void fetchRecommendations();
    },
    250,
  );

  const scheduleRecommendationsRefresh = ({ immediate = false } = {}) => {
    if (!selectedLora.value || !isHydrated.value) {
      return;
    }

    if (immediate) {
      debouncedFetchRecommendations.cancel();
      void fetchRecommendations();
      return;
    }

    debouncedFetchRecommendations();
  };

  const resetSettings = () => {
    limit.value = options.initialLimit ?? 10;
    similarityThreshold.value = options.initialThreshold ?? 0.1;
    weights.value = { ...DEFAULT_WEIGHTS, ...(options.initialWeights ?? {}) };
  };

  watch(
    () => recommendationResource.error.value,
    (err) => {
      if (err) {
        error.value = toErrorMessage(err, 'Failed to fetch recommendations');
      }
    },
  );

  watch(selectedLoraId, (next) => {
    if (!next) {
      debouncedFetchRecommendations.cancel();
      clearRecommendations();
      return;
    }

    if (!isHydrated.value) {
      return;
    }

    scheduleRecommendationsRefresh({ immediate: true });
  });

  watch(
    () => selectedLora.value?.id ?? '',
    (next, previous) => {
      if (!next) {
        clearRecommendations();
        return;
      }

      if (next !== previous && isHydrated.value) {
        void fetchRecommendations();
      }
    },
  );

  watch(loras, (items) => {
    if (!items.length || !selectedLoraId.value) {
      return;
    }

    if (!items.some((item) => item.id === selectedLoraId.value)) {
      selectedLoraId.value = '';
    }
  });

  watch([limit, similarityThreshold], () => {
    scheduleRecommendationsRefresh();
  });

  watch(
    weights as Ref<WeightState>,
    () => {
      scheduleRecommendationsRefresh();
    },
    { deep: true },
  );

  watch(isHydrated, (ready) => {
    if (ready && selectedLora.value) {
      scheduleRecommendationsRefresh({ immediate: true });
    }
  });

  void catalogStore.ensureLoaded();

  return {
    loras,
    lorasError,
    isLoadingLoras: catalogIsLoading,
    selectedLoraId,
    selectedLora,
    limit,
    similarityThreshold,
    weights,
    recommendations,
    error,
    isLoading,
    fetchRecommendations,
    resetSettings,
    recommendationPath,
  };
};
