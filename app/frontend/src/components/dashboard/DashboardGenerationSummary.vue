<template>
  <div class="card h-full">
    <div class="card-body flex flex-col gap-6">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-gray-900">Generation Snapshot</h3>
          <p class="text-sm text-gray-500">Recent jobs and high-level metrics from your history.</p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <RouterLink class="btn btn-secondary btn-sm" to="/generate">
            Start new job
          </RouterLink>
          <RouterLink class="btn btn-ghost btn-sm" to="/history">
            View history
          </RouterLink>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div class="text-xl font-semibold text-gray-900">{{ stats.total_results }}</div>
          <div class="text-xs uppercase tracking-wide text-gray-500">Images</div>
        </div>
        <div class="rounded-lg border border-gray-200 bg-emerald-50 p-3">
          <div class="text-xl font-semibold text-emerald-700">{{ formattedAverage }}</div>
          <div class="text-xs uppercase tracking-wide text-emerald-700">Avg rating</div>
        </div>
        <div class="rounded-lg border border-gray-200 bg-indigo-50 p-3">
          <div class="text-xl font-semibold text-indigo-700">{{ stats.total_favorites }}</div>
          <div class="text-xs uppercase tracking-wide text-indigo-700">Favorites</div>
        </div>
        <div class="rounded-lg border border-gray-200 bg-sky-50 p-3">
          <div class="text-xl font-semibold text-sky-700">{{ formattedSize }}</div>
          <div class="text-xs uppercase tracking-wide text-sky-700">Storage</div>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-semibold text-gray-700">Latest results</h4>
          <button
            type="button"
            class="btn btn-ghost btn-xs"
            :disabled="isLoading"
            @click="refresh"
          >
            <span v-if="isLoading" class="flex items-center gap-2">
              <span class="loading loading-spinner loading-xs"></span>
              Updating…
            </span>
            <span v-else>Refresh</span>
          </button>
        </div>
        <ul v-if="recentResults.length" class="mt-3 space-y-2">
          <li
            v-for="item in recentResults"
            :key="item.id"
            class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3"
          >
            <div>
              <p class="font-medium text-gray-900">
                {{ item.prompt ? truncate(item.prompt, 100) : 'Untitled generation' }}
              </p>
              <p class="text-xs text-gray-500">
                {{ item.width ?? '—' }}×{{ item.height ?? '—' }} · CFG {{ item.cfg_scale ?? '—' }}
              </p>
            </div>
            <div class="shrink-0 text-right text-xs text-gray-500">
              <div>{{ formatRelativeTime(item.created_at ?? '') }}</div>
              <div v-if="item.rating != null" class="text-amber-600">
                ★ {{ Number(item.rating).toFixed(1) }}
              </div>
              <div v-else-if="item.is_favorite" class="text-indigo-600">
                Favorited
              </div>
            </div>
          </li>
        </ul>
        <div v-else-if="isLoading" class="mt-3 flex flex-col items-center gap-2 text-sm text-gray-500">
          <span class="loading loading-spinner loading-sm"></span>
          Loading generation history…
        </div>
        <div v-else class="mt-3 rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
          No generation history is available yet. Launch a new job to populate this feed.
        </div>
      </div>

      <p v-if="error" class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        Unable to refresh generation summary. {{ errorMessage }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterLink } from 'vue-router';

import { listResults as listHistoryResults } from '@/services';
import { useGenerationResultsStore } from '@/stores/generation';
import { useBackendBase } from '@/utils/backend';
import { formatFileSize, formatRelativeTime } from '@/utils/format';
import type { GenerationHistoryResult, GenerationHistoryStats } from '@/types';

const SUMMARY_QUERY = Object.freeze({ page_size: 4, sort: 'created_at_desc' as const });

const backendBase = useBackendBase();
const resultsStore = useGenerationResultsStore();
const { recentResults: storeResults } = storeToRefs(resultsStore);

const stats = ref<GenerationHistoryStats>({
  total_results: 0,
  avg_rating: 0,
  total_favorites: 0,
  total_size: 0,
});

const fetchedResults = ref<GenerationHistoryResult[]>([]);

const isLoading = ref(false);
const error = ref<unknown>(null);
const errorMessage = computed(() => {
  const value = error.value;
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return 'Please try again.';
});

const formattedAverage = computed(() => stats.value.avg_rating.toFixed(1));
const formattedSize = computed(() => formatFileSize(stats.value.total_size));

const recentResults = computed<GenerationHistoryResult[]>(() => {
  const limit = SUMMARY_QUERY.page_size ?? 4;
  if (fetchedResults.value.length) {
    return fetchedResults.value.slice(0, limit);
  }
  if (storeResults.value.length) {
    return storeResults.value.slice(0, limit);
  }
  return [];
});

const truncate = (value: string, maxLength: number) => {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

const refresh = async () => {
  if (isLoading.value) {
    return;
  }

  isLoading.value = true;
  error.value = null;

  try {
    const output = await listHistoryResults(backendBase.value, { ...SUMMARY_QUERY });
    stats.value = output.stats;
    fetchedResults.value = output.results;
    if (!storeResults.value.length && output.results.length) {
      resultsStore.setResults(output.results);
    }
  } catch (err) {
    error.value = err instanceof Error ? err : new Error('Failed to load generation summary');
    console.error('Failed to refresh generation summary', err);
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  await refresh();
});
</script>
