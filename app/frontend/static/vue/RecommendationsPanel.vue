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

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useApi } from './composables/useApi.js';

// State
const loras = ref([]);
const isLoadingLoras = ref(false);
const lorasError = ref('');

const selectedLoraId = ref('');
const selectedLora = computed(() => loras.value.find(l => String(l.id) === String(selectedLoraId.value)) || null);

const limit = ref(10);
const similarityThreshold = ref(0.1);
const weights = ref({ semantic: 0.6, artistic: 0.3, technical: 0.1 });

const recommendations = ref([]);
const isLoadingRecs = ref(false);
const recsError = ref('');

const fmtScore = (v) => (v == null ? '-' : Number(v).toFixed(3));

// Data loading via composables
const lorasUrl = '/api/adapters?per_page=100&page=1';
const { data: lorasData, error: lorasErr, isLoading: lorasLoading, fetchData: loadLoras } = useApi(lorasUrl, { credentials: 'same-origin' });

const fetchLoras = async () => {
  isLoadingLoras.value = true;
  lorasError.value = '';
  try {
    await loadLoras();
    const payload = lorasData.value;
    loras.value = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);
    if (!Array.isArray(loras.value)) loras.value = [];
  } catch (e) {
    lorasError.value = 'Failed to load LoRAs';
  } finally {
    // reflect composable state into existing flag for template compatibility
    isLoadingLoras.value = !!lorasLoading.value;
    // ensure we end loading state even if composable didn’t toggle yet
    isLoadingLoras.value = false;
  }
};

const buildSimilarUrl = () => {
  if (!selectedLoraId.value) return '';
  const base = `/api/recommendations/similar/${encodeURIComponent(selectedLoraId.value)}`;
  const params = new URLSearchParams();
  params.set('limit', String(limit.value));
  params.set('similarity_threshold', String(similarityThreshold.value));
  // Note: backend expects a dict for weights; default weights are applied server-side.
  // If nested query parsing is enabled, uncomment the following lines:
  // params.set('weights.semantic', String(weights.value.semantic));
  // params.set('weights.artistic', String(weights.value.artistic));
  // params.set('weights.technical', String(weights.value.technical));
  return `${base}?${params.toString()}`;
};

const { data: recsData, error: recsErrObj, isLoading: recsLoading, fetchData: loadRecs } = useApi(() => buildSimilarUrl(), { credentials: 'same-origin' });

const fetchRecommendations = async () => {
  if (!selectedLoraId.value) return;
  isLoadingRecs.value = true;
  recsError.value = '';
  recommendations.value = [];
  try {
    await loadRecs();
    const payload = recsData.value;
    recommendations.value = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
  } catch (e) {
    recsError.value = 'Failed to fetch recommendations';
  } finally {
    // reflect composable state into existing flag for template compatibility
    isLoadingRecs.value = !!recsLoading.value;
    // ensure we end loading state even if composable didn’t toggle yet
    isLoadingRecs.value = false;
  }
};

const resetSettings = () => {
  limit.value = 10;
  similarityThreshold.value = 0.1;
  weights.value = { semantic: 0.6, artistic: 0.3, technical: 0.1 };
};

onMounted(async () => {
  await fetchLoras();
});

watch([selectedLoraId, limit, similarityThreshold], () => {
  if (selectedLoraId.value) fetchRecommendations();
});

</script>
