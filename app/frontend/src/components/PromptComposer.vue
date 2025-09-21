<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="page-header">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="page-title">Prompt Composer</h1>
          <p class="page-subtitle">Build and compose prompts with LoRAs</p>
        </div>
        <div class="header-actions flex gap-2">
          <button class="btn btn-secondary btn-sm" @click="loadComposition">Load Composition</button>
          <button class="btn btn-secondary btn-sm" @click="clearComposition" :disabled="activeLoras.length === 0">Clear All</button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Left: Available LoRAs -->
      <div class="lg:col-span-1">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Available LoRAs</h3>
          </div>
          <div class="card-body space-y-4">
            <!-- Search/Filter -->
            <div>
              <input class="form-input w-full" placeholder="Search LoRAs..." v-model="searchTerm" />
              <label class="inline-flex items-center gap-2 mt-2 text-sm">
                <input type="checkbox" v-model="activeOnly" />
                <span>Active Only</span>
              </label>
            </div>

            <!-- Lora list -->
            <div class="space-y-2 max-h-96 overflow-y-auto" data-testid="lora-list">
              <div
                v-for="l in filteredLoras"
                :key="l.id"
                class="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded cursor-pointer"
                :class="{ 'opacity-50': isInComposition(l.id) }"
                @click="addToComposition(l)"
              >
                <div class="min-w-0">
                  <div class="font-medium text-sm truncate">{{ l.name }}</div>
                  <div class="text-xs text-gray-500 truncate">{{ l.description || 'No description' }}</div>
                </div>
                <div class="text-xs text-gray-500" v-if="l.active">Active</div>
              </div>
              <div v-if="!isLoading && filteredLoras.length === 0" class="text-sm text-gray-500">No LoRAs found</div>
              <div v-if="error" class="text-sm text-red-600">Failed to load LoRAs</div>
              <div v-if="isLoading" class="text-sm text-gray-500">Loading…</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Middle: Composition -->
      <div class="lg:col-span-1">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Composition</h3>
          </div>
          <div class="card-body space-y-3" data-testid="composition">
            <div
              v-for="(l, idx) in activeLoras"
              :key="l.id"
              class="border rounded p-3 bg-white"
            >
              <div class="flex items-center gap-2">
                <div class="font-medium flex-1 truncate">{{ l.name }}</div>
                <button class="btn btn-secondary btn-xs" @click="moveUp(idx)" :disabled="idx === 0">↑</button>
                <button class="btn btn-secondary btn-xs" @click="moveDown(idx)" :disabled="idx === activeLoras.length - 1">↓</button>
                <button class="btn btn-secondary btn-xs" @click="removeFromComposition(idx)">✕</button>
              </div>
              <div class="mt-2">
                <label class="text-xs">Weight: {{ l.weight.toFixed(2) }}</label>
                <input type="range" min="0" max="2" step="0.05" v-model.number="l.weight" @input="updateFinal" class="w-full" />
              </div>
            </div>
            <div v-if="activeLoras.length === 0" class="text-sm text-gray-500">No LoRAs in composition</div>
          </div>
        </div>

        <div class="card mt-4">
          <div class="card-header">
            <h3 class="card-title">Quick Actions</h3>
          </div>
          <div class="card-body space-y-2">
            <button class="btn btn-secondary btn-sm w-full" @click="balanceWeights" :disabled="activeLoras.length === 0">Balance All Weights</button>
            <button class="btn btn-secondary btn-sm w-full" @click="duplicateComposition" :disabled="activeLoras.length === 0">Duplicate Composition</button>
          </div>
        </div>
      </div>

      <!-- Right: Prompt and actions -->
      <div class="lg:col-span-1">
        <div class="card">
          <div class="card-header"><h3 class="card-title">Generated Prompt</h3></div>
          <div class="card-body space-y-3">
            <div>
              <label class="form-label">Base Prompt</label>
              <textarea class="form-input h-20" v-model.trim="basePrompt" @input="updateFinal" placeholder="Enter your base prompt"></textarea>
              <p v-if="basePromptError" class="text-xs text-red-600" data-testid="base-error">{{ basePromptError }}</p>
            </div>
            <div>
              <label class="form-label">Negative Prompt</label>
              <textarea class="form-input h-16" v-model.trim="negativePrompt" placeholder="Enter negative prompt"></textarea>
            </div>
            <div>
              <label class="form-label">Complete Prompt</label>
              <textarea class="form-input h-28 font-mono text-xs" readonly :value="finalPrompt"></textarea>
            </div>
            <div class="space-y-2">
              <button class="btn btn-secondary w-full" @click="copyPrompt">Copy Prompt</button>
              <button class="btn btn-secondary w-full" :disabled="activeLoras.length === 0" @click="saveComposition">Save Composition</button>
              <button class="btn btn-primary w-full" :disabled="isGenerating" @click="generateImage">
                <span v-if="!isGenerating">Generate Image</span>
                <span v-else>Generating…</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type ComputedRef, type Ref } from 'vue';

import { useAdapterListApi } from '@/composables/apiClients';
import { createGenerationParams, requestGeneration } from '@/services/generationService';
import { copyToClipboard } from '@/utils/browser';

import type {
  AdapterRead,
  AdapterSummary,
  CompositionEntry,
  SavedComposition,
} from '@/types';

const STORAGE_KEY = 'prompt-composer-composition';
const DEFAULT_WEIGHT = 1;

const lastSaved: Ref<SavedComposition | null> = ref(null);

const loras: Ref<AdapterSummary[]> = ref([]);
const searchTerm = ref<string>('');
const activeOnly = ref<boolean>(false);
const { adapters, error, isLoading, fetchData: loadLoras } = useAdapterListApi({ page: 1, perPage: 200 });

const activeLoras: Ref<CompositionEntry[]> = ref([]);
const basePrompt = ref<string>('');
const negativePrompt = ref<string>('');
const finalPrompt = ref<string>('');
const basePromptError = ref<string>('');
const isGenerating = ref<boolean>(false);

const filteredLoras: ComputedRef<AdapterSummary[]> = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  let items = loras.value;

  if (activeOnly.value) {
    items = items.filter((item) => item.active);
  }

  if (term) {
    items = items.filter((item) => item.name.toLowerCase().includes(term));
  }

  return items;
});

const isInComposition = (id: AdapterSummary['id']): boolean => {
  return activeLoras.value.some((entry) => String(entry.id) === String(id));
};

const addToComposition = (lora: AdapterSummary): void => {
  if (isInComposition(lora.id)) {
    return;
  }

  activeLoras.value.push({ id: lora.id, name: lora.name, weight: DEFAULT_WEIGHT });
  updateFinal();
};

const removeFromComposition = (index: number): void => {
  if (index < 0 || index >= activeLoras.value.length) {
    return;
  }

  activeLoras.value.splice(index, 1);
  updateFinal();
};

const moveUp = (index: number): void => {
  if (index <= 0 || index >= activeLoras.value.length) {
    return;
  }

  const [item] = activeLoras.value.splice(index, 1);

  if (!item) {
    return;
  }

  activeLoras.value.splice(index - 1, 0, item);
  updateFinal();
};

const moveDown = (index: number): void => {
  if (index < 0 || index >= activeLoras.value.length - 1) {
    return;
  }

  const [item] = activeLoras.value.splice(index, 1);

  if (!item) {
    return;
  }

  activeLoras.value.splice(index + 1, 0, item);
  updateFinal();
};

const balanceWeights = (): void => {
  if (activeLoras.value.length === 0) {
    return;
  }

  activeLoras.value.forEach((entry) => {
    entry.weight = DEFAULT_WEIGHT;
  });
  updateFinal();
};

const duplicateComposition = (): void => {
  activeLoras.value = activeLoras.value.map((entry) => ({ ...entry }));
  updateFinal();
};

const formatWeightToken = (value: number | string | null | undefined): string => {
  const parsed = typeof value === 'number' ? value : Number(value);
  const numeric = Number.isFinite(parsed) ? parsed : DEFAULT_WEIGHT;
  const fixed = numeric.toFixed(2);
  const trimmed = fixed
    .replace(/(\.\d*?[1-9])0+$/u, '$1')
    .replace(/\.0+$/u, '');
  return trimmed.includes('.') ? trimmed : `${trimmed}.0`;
};

const buildFinalPrompt = (): string => {
  const base = basePrompt.value.trim();

  if (!base) {
    return '';
  }

  const parts: string[] = [base];

  activeLoras.value.forEach((entry) => {
    const weightToken = formatWeightToken(entry.weight);
    parts.push(`<lora:${entry.name}:${weightToken}>`);
  });

  return parts.join(' ');
};

const validate = (): boolean => {
  basePromptError.value = '';

  if (!basePrompt.value.trim()) {
    basePromptError.value = 'Base prompt is required';
    return false;
  }

  if (basePrompt.value.length > 1000) {
    basePromptError.value = 'Base prompt is too long';
    return false;
  }

  return true;
};

const updateFinal = (): void => {
  finalPrompt.value = buildFinalPrompt();
};

const copyPrompt = async (): Promise<void> => {
  try {
    updateFinal();
    const success = await copyToClipboard(finalPrompt.value || '');

    if (!success && import.meta.env.DEV) {
      console.warn('Failed to copy prompt to clipboard');
    }
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Copy prompt failed', error);
    }
  }
};

const toSavedComposition = (value: unknown): SavedComposition | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<SavedComposition> & { items?: unknown };

  const items = Array.isArray(record.items)
    ? record.items
        .map((item) => {
          if (!item || typeof item !== 'object') {
            return null;
          }

          const entry = item as Partial<CompositionEntry>;

          if (typeof entry.id !== 'string' || typeof entry.name !== 'string') {
            return null;
          }

          const weight =
            typeof entry.weight === 'number' ? entry.weight : Number(entry.weight);
          const normalisedWeight = Number.isFinite(weight) ? weight : DEFAULT_WEIGHT;

          return {
            id: entry.id,
            name: entry.name,
            weight: normalisedWeight,
          } satisfies CompositionEntry;
        })
        .filter((entry): entry is CompositionEntry => entry !== null)
    : [];

  const base = typeof record.base === 'string' ? record.base : '';
  const neg = typeof record.neg === 'string' ? record.neg : '';

  return { items, base, neg };
};

const saveComposition = (): void => {
  const payload: SavedComposition = {
    items: activeLoras.value.map((entry) => ({ ...entry })),
    base: basePrompt.value,
    neg: negativePrompt.value,
  };

  lastSaved.value = payload;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to persist composition', error);
    }
  }
};

const loadComposition = (): void => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let payload: SavedComposition | null = null;

    if (raw) {
      payload = toSavedComposition(JSON.parse(raw) as unknown);
    } else if (lastSaved.value) {
      payload = lastSaved.value;
    }

    if (!payload) {
      return;
    }

    activeLoras.value = payload.items.map((entry) => ({ ...entry }));
    basePrompt.value = payload.base;
    negativePrompt.value = payload.neg;
    lastSaved.value = payload;
    updateFinal();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to load composition', error);
    }
  }
};

const clearComposition = (): void => {
  activeLoras.value = [];
  updateFinal();
};

const generateImage = async (): Promise<void> => {
  if (!validate()) {
    updateFinal();
    return;
  }

  isGenerating.value = true;

  try {
    updateFinal();
    const trimmedNegative = negativePrompt.value.trim();
    const params = createGenerationParams({
      prompt: finalPrompt.value,
      negative_prompt: trimmedNegative ? trimmedNegative : null,
    });

    await requestGeneration({
      ...params,
      loras: activeLoras.value.map((entry) => ({ ...entry })),
    });
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Failed to trigger generation', error);
    }
  } finally {
    isGenerating.value = false;
  }
};

onMounted(async () => {
  await loadLoras();
});

watch(
  () => adapters.value as AdapterRead[] | undefined,
  (next: AdapterRead[] | undefined) => {
    const items = Array.isArray(next) ? next : [];

    loras.value = items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      active: item.active ?? true,
    }));
  },
  { immediate: true },
);

watch<[CompositionEntry[], string, string]>(
  () => [activeLoras.value, basePrompt.value, negativePrompt.value],
  ([items, base, neg]: [CompositionEntry[], string, string]) => {
    const payload: SavedComposition = {
      items: items.map((entry) => ({ ...entry })),
      base,
      neg,
    };

    lastSaved.value = payload;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('Failed to persist composition', error);
      }
    }
  },
  { deep: true },
);

</script>
