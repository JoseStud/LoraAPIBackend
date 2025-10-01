import { computed, ref, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useAsyncResource } from '@/composables/shared';

import { useBackendClient } from '@/services/backendClient';

import { useBackendEnvironment, useSettingsStore } from '@/stores/settings';
import { useAdapterCatalogStore } from '@/features/lora/public';
import type { AdapterSummary, RecommendationItem, RecommendationResponse } from '@/types';
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

const isRecommendationResponse = (
  payload: unknown,
): payload is RecommendationResponse =>
  Boolean(
    payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as RecommendationResponse).recommendations),
  );

const normaliseRecommendations = (
  payload: RecommendationResponse | RecommendationItem[] | null | undefined,
): RecommendationItem[] => {
  if (!payload) {
    return [];
  }

  if (isRecommendationResponse(payload)) {
    return payload.recommendations ?? [];
  }

  if (Array.isArray(payload)) {
    return payload;
  }

  return [];
};

const unwrapMaybeRef = <T>(input: T | Ref<T>): T => {
  if (typeof input === 'object' && input !== null && 'value' in input) {
    return (input as Ref<T>).value;
  }
  return input as T;
};

export const useRecommendations = (options: UseRecommendationsOptions = {}) => {
  const backendClient = useBackendClient();
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
  void backendEnvironment.readyPromise.then(() => {
    hydrationReady.value = true;
  });

  const isHydrated = computed<boolean>(() => hydrationReady.value && settingsLoaded.value);

  const recommendationPath = computed<string | null>(() => {
    if (!selectedLoraId.value) {
      return null;
    }
    const base = `/recommendations/similar/${encodeURIComponent(selectedLoraId.value)}`;
    const params = new URLSearchParams();
    params.set('limit', String(limit.value));
    params.set('similarity_threshold', String(similarityThreshold.value));
    WEIGHT_KEYS.forEach((key) => {
      params.set(`weight_${key}`, weights.value[key].toString());
    });
    return `${base}?${params.toString()}`;
  });

  const recommendationResource = useAsyncResource<RecommendationItem[], string | null>(
    async (path) => {
      if (!path) {
        return [];
      }
      const payload = await backendClient.getJson<RecommendationResponse | RecommendationItem[] | null>(path);
      return normaliseRecommendations(payload);
    },
    {
      initialArgs: null,
      initialValue: [],
      getKey: (value) => value ?? '',
      backendRefresh: {
        enabled: () => Boolean(selectedLora.value),
        getArgs: () => recommendationPath.value,
      },
      onError: (err) => {
        if (import.meta.env.DEV) {
          console.error('[recommendations] Failed to fetch recommendations', err);
        }
      },
    },
  );

  const recommendations = computed<RecommendationItem[]>(() => recommendationResource.data.value ?? []);
  const error = ref('');
  const isLoading = computed<boolean>(() => recommendationResource.isLoading.value);

  const fetchRecommendations = async (): Promise<RecommendationItem[]> => {
    if (!selectedLora.value || !isHydrated.value) {
      recommendationResource.setData([], { markLoaded: false, args: null });
      error.value = '';
      return [];
    }

    const path = recommendationPath.value;
    if (!path) {
      recommendationResource.setData([], { markLoaded: false, args: null });
      error.value = '';
      return [];
    }

    try {
      const payload = await recommendationResource.refresh(path);
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
      recommendationResource.setData([], { markLoaded: false, args: null });
      recommendationResource.clearError();
      error.value = '';
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
        recommendationResource.setData([], { markLoaded: false, args: null });
        recommendationResource.clearError();
        error.value = '';
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
