<template>
  <div class="card h-full">
    <div class="card-body flex flex-col gap-6">
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="text-lg font-semibold text-gray-900">LoRA Catalog Snapshot</h3>
            <p class="text-sm text-gray-500">Latest adapters and their activity status.</p>
          </div>
          <RouterLink class="btn btn-secondary btn-sm" to="/loras">
            Manage LoRAs
          </RouterLink>
        </div>
        <div class="grid grid-cols-3 gap-3 text-center">
          <div class="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div class="text-2xl font-semibold text-gray-900">{{ totalLoras }}</div>
            <div class="text-xs uppercase tracking-wide text-gray-500">Total</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-emerald-50 p-3">
            <div class="text-2xl font-semibold text-emerald-700">{{ activeLoras }}</div>
            <div class="text-xs uppercase tracking-wide text-emerald-700">Active</div>
          </div>
          <div class="rounded-lg border border-gray-200 bg-amber-50 p-3">
            <div class="text-2xl font-semibold text-amber-700">{{ inactiveLoras }}</div>
            <div class="text-xs uppercase tracking-wide text-amber-700">Inactive</div>
          </div>
        </div>
      </div>

      <div>
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-semibold text-gray-700">Recently updated</h4>
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
            <span v-else>
              Refresh
            </span>
          </button>
        </div>
        <ul v-if="recentLoras.length" class="mt-3 space-y-2">
          <li
            v-for="item in recentLoras"
            :key="item.id"
            class="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3"
          >
            <div>
              <p class="font-medium text-gray-900">{{ item.name }}</p>
              <p class="text-xs text-gray-500">
                {{ item.description ? truncate(item.description, 96) : 'No description available.' }}
              </p>
            </div>
            <div class="shrink-0 text-right text-xs text-gray-500">
              <div>{{ formatRelativeTime(item.updated_at ?? item.created_at ?? '') }}</div>
              <div :class="item.active ? 'text-emerald-600' : 'text-amber-600'">
                {{ item.active ? 'Active' : 'Inactive' }}
              </div>
            </div>
          </li>
        </ul>
        <div v-else-if="isLoading" class="mt-3 flex flex-col items-center gap-2 text-sm text-gray-500">
          <span class="loading loading-spinner loading-sm"></span>
          Loading adapter data…
        </div>
        <div v-else class="mt-3 rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
          No adapters are loaded yet. Import a LoRA to get started.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterLink } from 'vue-router';

import { useAdapterCatalogStore } from '@/features/lora';
import { formatRelativeTime } from '@/utils/format';

const SUMMARY_QUERY = Object.freeze({ perPage: 12, sort: 'last_updated_desc' as const });

const catalogStore = useAdapterCatalogStore();
const { loras, isLoading } = storeToRefs(catalogStore);

const totalLoras = computed(() => loras.value.length);
const activeLoras = computed(() => loras.value.filter((item) => item.active !== false).length);
const inactiveLoras = computed(() => Math.max(0, totalLoras.value - activeLoras.value));
const getTimestamp = (value: string | undefined | null): number => {
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const recentLoras = computed(() =>
  [...loras.value]
    .sort((a, b) => getTimestamp(b.updated_at ?? b.created_at) - getTimestamp(a.updated_at ?? a.created_at))
    .slice(0, 5),
);

const truncate = (value: string, maxLength: number) => {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
};

const refresh = async () => {
  await catalogStore.ensureLoaded(SUMMARY_QUERY);
};

onMounted(async () => {
  if (!loras.value.length) {
    await refresh();
  } else {
    void catalogStore.ensureLoaded(SUMMARY_QUERY);
  }
});
</script>
