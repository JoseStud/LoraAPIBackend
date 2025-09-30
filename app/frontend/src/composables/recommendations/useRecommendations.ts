import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { storeToRefs } from 'pinia';

import { useRecommendationApi } from '@/composables/shared';
import { useAdapterCatalogStore, useSettingsStore } from '@/stores';
import { useBackendEnvironment } from '@/stores/settings';
import type { AdapterSummary, RecommendationItem, RecommendationResponse } from '@/types';

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

export const useRecommendations = (options: UseRecommendationsOptions = {}) => {
  const adapterCatalog = useAdapterCatalogStore();
  const settingsStore = useSettingsStore();
  const backendEnvironment = useBackendEnvironment();

  const { adapters: catalogAdapters, error: lorasErr, isLoading: lorasLoading } = storeToRefs(adapterCatalog);
  const { isLoaded: settingsLoaded } = storeToRefs(settingsStore);

  const loras = computed<AdapterSummary[]>(() => catalogAdapters.value);
  const lorasError = computed<string>(() =>
    lorasErr.value ? toErrorMessage(lorasErr.value, 'Unable to load available LoRAs') : '',
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

  const recommendations = ref<RecommendationItem[]>([]);
  const error = ref<string>('');

  const hydrationReady = ref(false);
  void backendEnvironment.readyPromise.then(() => {
    hydrationReady.value = true;
  });

  const isHydrated = computed<boolean>(() => hydrationReady.value && settingsLoaded.value);

  const recommendationPath = computed<string>(() => {
    if (!selectedLoraId.value) {
      return '';
    }
    const base = `recommendations/similar/${encodeURIComponent(selectedLoraId.value)}`;
    const params = new URLSearchParams();
    params.set('limit', String(limit.value));
    params.set('similarity_threshold', String(similarityThreshold.value));
    WEIGHT_KEYS.forEach((key) => {
      params.set(`weight_${key}`, weights.value[key].toString());
    });
    return `${base}?${params.toString()}`;
  });

  const {
    data: recsData,
    error: recsErrObj,
    isLoading: recsLoading,
    fetchData: loadRecs,
  } = useRecommendationApi(recommendationPath);

  const isLoading = computed<boolean>(() => recsLoading.value);

  const applyRecommendations = (payload: RecommendationResponse | RecommendationItem[] | null | undefined) => {
    if (!payload) {
      recommendations.value = [];
      return;
    }

    if (isRecommendationResponse(payload)) {
      recommendations.value = payload.recommendations;
      return;
    }

    if (Array.isArray(payload)) {
      recommendations.value = payload;
      return;
    }

    recommendations.value = [];
  };

  const fetchRecommendations = async (): Promise<RecommendationItem[]> => {
    error.value = '';
    recommendations.value = [];

    if (!selectedLora.value) {
      return recommendations.value;
    }

    if (!isHydrated.value) {
      return recommendations.value;
    }

    try {
      const payload = (await loadRecs()) ?? recsData.value;
      applyRecommendations(payload);
    } catch (err) {
      error.value = toErrorMessage(err, 'Failed to fetch recommendations');
    }

    return recommendations.value;
  };

  const resetSettings = () => {
    limit.value = options.initialLimit ?? 10;
    similarityThreshold.value = options.initialThreshold ?? 0.1;
    weights.value = { ...DEFAULT_WEIGHTS, ...(options.initialWeights ?? {}) };
  };

  watch(recsErrObj, (err) => {
    if (err) {
      error.value = toErrorMessage(err, 'Failed to fetch recommendations');
    }
  });

  watch(selectedLoraId, (next) => {
    if (!next) {
      recommendations.value = [];
      error.value = '';
      return;
    }

    if (isHydrated.value) {
      void fetchRecommendations();
    }
  });

  const triggerRefreshIfReady = () => {
    if (!selectedLora.value || !isHydrated.value) {
      return;
    }
    void fetchRecommendations();
  };

  watch([limit, similarityThreshold], triggerRefreshIfReady);

  watch(weights as Ref<WeightState>, triggerRefreshIfReady, { deep: true });

  watch(isHydrated, (ready) => {
    if (ready && selectedLora.value) {
      void fetchRecommendations();
    }
  });

  const stopBackendSubscription = backendEnvironment.onBackendUrlChange(() => {
    if (selectedLora.value) {
      void fetchRecommendations();
    }
  });

  onScopeDispose(() => {
    stopBackendSubscription();
  });

  void adapterCatalog.ensureLoaded({ perPage: 200 });

  return {
    loras,
    lorasError,
    isLoadingLoras: computed<boolean>(() => lorasLoading.value),
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

export type UseRecommendationsReturn = ReturnType<typeof useRecommendations>;

export const defaultRecommendationWeights = (): WeightState => ({ ...DEFAULT_WEIGHTS });
