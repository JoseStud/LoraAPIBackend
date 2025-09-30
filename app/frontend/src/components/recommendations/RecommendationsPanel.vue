<template>
  <div class="card">
    <div class="card-header flex items-center justify-between">
      <h3 class="card-title flex items-center gap-2">
        <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Recommendations (Vue)
      </h3>
      <div class="text-xs text-gray-500">Progressive island</div>
    </div>

    <div class="p-4 space-y-6">
      <!-- Controls -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- LoRA Selection -->
        <div>
          <label class="form-label">Select Target LoRA</label>
          <select
            class="form-select w-full"
            :disabled="isLoadingLoras"
            v-model="selectedLoraId"
          >
            <option value="">Choose a LoRA...</option>
            <option v-for="l in loras" :key="l.id" :value="l.id">{{ l.name }}</option>
          </select>
          <p v-if="lorasError" class="text-sm text-red-600 mt-1">{{ lorasError }}</p>
        </div>

        <!-- Selected Preview -->
        <div v-if="selectedLora" class="lora-preview-box">
          <div class="flex items-center gap-3">
            <div class="lora-preview-icon-container">
              <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <div class="flex-1">
              <h4 class="font-medium text-gray-900">{{ selectedLora?.name }}</h4>
              <p class="text-sm text-gray-600">{{ selectedLora?.description || 'No description' }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Settings -->
      <div v-if="selectedLoraId" class="card">
        <div class="p-4 space-y-4">
          <h4 class="font-medium mb-2 flex items-center">
            <svg class="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />
            </svg>
            Similarity Settings
          </h4>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="form-label">Results</label>
              <input type="number" class="form-input w-24" min="1" max="50" v-model.number="limit" />
            </div>
            <div>
              <label class="form-label">Threshold: {{ similarityThreshold.toFixed(2) }}</label>
              <input type="range" min="0" max="1" step="0.05" class="w-full" v-model.number="similarityThreshold" />
            </div>
            <div class="text-right">
              <button class="btn btn-secondary btn-sm mt-6" @click="resetSettings">Reset</button>
            </div>
          </div>

          <!-- Weights (UI only for now; API uses defaults unless backend supports nested query dict) -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="form-label">Semantic: {{ weights.semantic.toFixed(1) }}</label>
              <input type="range" min="0" max="1" step="0.1" class="w-full" v-model.number="weights.semantic" />
            </div>
            <div>
              <label class="form-label">Artistic: {{ weights.artistic.toFixed(1) }}</label>
              <input type="range" min="0" max="1" step="0.1" class="w-full" v-model.number="weights.artistic" />
            </div>
            <div>
              <label class="form-label">Technical: {{ weights.technical.toFixed(1) }}</label>
              <input type="range" min="0" max="1" step="0.1" class="w-full" v-model.number="weights.technical" />
            </div>
          </div>
        </div>
      </div>

      <!-- Results -->
      <div v-if="selectedLoraId">
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-medium">Results</h4>
          <button class="btn btn-primary btn-sm" :disabled="isLoadingRecs" @click="fetchRecommendations">
            <span v-if="isLoadingRecs">Loading...</span>
            <span v-else>Refresh</span>
          </button>
        </div>
        <div v-if="recsError" class="text-sm text-red-600 mb-2">{{ recsError }}</div>
        <div v-if="isLoadingRecs" class="text-gray-500">Fetching recommendations…</div>
        <div v-else-if="recommendations.length === 0" class="text-gray-500">No recommendations yet.</div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div v-for="r in recommendations" :key="r.lora_id" class="border rounded-lg p-3 hover:shadow-sm">
            <div class="flex items-center justify-between">
              <div class="font-medium text-gray-900">{{ r.lora_name }}</div>
              <div class="text-xs text-gray-600">{{ fmtScore(r.similarity_score) }}</div>
            </div>
            <div class="text-sm text-gray-600 line-clamp-2 mt-1">{{ r.lora_description || '—' }}</div>
            <div class="mt-2 text-xs text-gray-500">Final: {{ fmtScore(r.final_score) }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { useRecommendationApi } from '@/composables/shared';
import { useAdapterCatalogStore } from '@/stores';
import type { AdapterSummary, RecommendationItem, RecommendationResponse } from '@/types';
import { useBackendUrl } from '@/utils/backend';
import { useSettingsStore, waitForSettingsHydration } from '@/stores';

const WEIGHT_KEYS = ['semantic', 'artistic', 'technical'] as const;
type WeightKey = (typeof WEIGHT_KEYS)[number];
type WeightState = Record<WeightKey, number>;

const DEFAULT_WEIGHTS: Readonly<WeightState> = {
  semantic: 0.6,
  artistic: 0.3,
  technical: 0.1,
} as const satisfies WeightState;

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return fallback;
};

const adapterCatalog = useAdapterCatalogStore();
const settingsStore = useSettingsStore();
const { adapters: catalogAdapters, error: lorasErr, isLoading: lorasLoading } = storeToRefs(adapterCatalog);
const { isLoaded: settingsLoaded } = storeToRefs(settingsStore);

void adapterCatalog.ensureLoaded({ perPage: 200 });

const loras = computed<AdapterSummary[]>(() => catalogAdapters.value);
const lorasError = computed<string>(() =>
  lorasErr.value ? toErrorMessage(lorasErr.value, 'Unable to load available LoRAs') : '',
);

const selectedLoraId = ref<AdapterSummary['id'] | ''>('');
const selectedLora = computed<AdapterSummary | null>(() => {
  if (!selectedLoraId.value) {
    return null;
  }
  return loras.value.find((lora) => lora.id === selectedLoraId.value) ?? null;
});

const limit = ref<number>(10);
const similarityThreshold = ref<number>(0.1);
const weights = ref<WeightState>({ ...DEFAULT_WEIGHTS });

const recommendations = ref<RecommendationItem[]>([]);
const recsError = ref<string>('');

const fmtScore = (value: number | null | undefined): string =>
  value == null ? '-' : Number(value).toFixed(3);

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

const recommendationUrl = useBackendUrl(recommendationPath);

const {
  data: recsData,
  error: recsErrObj,
  isLoading: recsLoading,
  fetchData: loadRecs,
} = useRecommendationApi(recommendationPath);

const isLoadingLoras = computed<boolean>(() => lorasLoading.value);
const isLoadingRecs = computed<boolean>(() => recsLoading.value);

const isRecommendationResponse = (payload: unknown): payload is RecommendationResponse =>
  Boolean(
    payload &&
      typeof payload === 'object' &&
      Array.isArray((payload as RecommendationResponse).recommendations),
  );

const resetSettings = (): void => {
  limit.value = 10;
  similarityThreshold.value = 0.1;
  weights.value = { ...DEFAULT_WEIGHTS };
};

const fetchRecommendations = async (): Promise<void> => {
  recsError.value = '';
  recommendations.value = [];

  if (!selectedLora.value) {
    return;
  }

  await waitForSettingsHydration(settingsStore);

  if (!recommendationUrl.value) {
    recsError.value = 'Unable to resolve recommendation endpoint.';
    return;
  }

  try {
    const payload = (await loadRecs()) ?? recsData.value;
    if (isRecommendationResponse(payload)) {
      recommendations.value = payload.recommendations;
    } else if (Array.isArray(payload)) {
      recommendations.value = payload;
    }
  } catch (error) {
    recsError.value = toErrorMessage(error, 'Failed to fetch recommendations');
  }
};

watch(recsErrObj, (error) => {
  if (error) {
    recsError.value = toErrorMessage(error, 'Failed to fetch recommendations');
  }
});

watch(selectedLoraId, (nextId) => {
  if (!nextId) {
    recommendations.value = [];
    recsError.value = '';
  }
});

onMounted(async () => {
  await waitForSettingsHydration(settingsStore);
  await adapterCatalog.ensureLoaded({ perPage: 200 });
});

watch([selectedLoraId, limit, similarityThreshold], () => {
  if (selectedLora.value && settingsLoaded.value) {
    void fetchRecommendations();
  }
});

watch(
  () => settingsLoaded.value,
  (loaded) => {
    if (loaded && selectedLora.value) {
      void fetchRecommendations();
    }
  },
);

</script>
