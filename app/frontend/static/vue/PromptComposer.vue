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

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useApi } from './composables/useApi.js';

const STORAGE_KEY = 'prompt-composer-composition';
const lastSaved = ref(null);

// Loras
const loras = ref([]);
const searchTerm = ref('');
const activeOnly = ref(false);
const { data, error, isLoading, fetchData: loadLoras } = useApi('/api/v1/adapters?per_page=200&page=1', { credentials: 'same-origin' });

// Composition
const activeLoras = ref([]);

// Prompt fields
const basePrompt = ref('');
const negativePrompt = ref('');
const finalPrompt = ref('');
const basePromptError = ref('');
const isGenerating = ref(false);

const filteredLoras = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  let items = loras.value;
  if (activeOnly.value) items = items.filter((i) => i.active);
  if (term) items = items.filter((i) => (i.name || '').toLowerCase().includes(term));
  return items;
});

const isInComposition = (id) => activeLoras.value.some((l) => String(l.id) === String(id));

const addToComposition = (l) => {
  if (isInComposition(l.id)) return;
  activeLoras.value.push({ id: l.id, name: l.name, weight: 1.0 });
  updateFinal();
};

const removeFromComposition = (idx) => {
  activeLoras.value.splice(idx, 1);
  updateFinal();
};

const moveUp = (idx) => {
  if (idx <= 0) return;
  const [item] = activeLoras.value.splice(idx, 1);
  activeLoras.value.splice(idx - 1, 0, item);
  updateFinal();
};

const moveDown = (idx) => {
  if (idx >= activeLoras.value.length - 1) return;
  const [item] = activeLoras.value.splice(idx, 1);
  activeLoras.value.splice(idx + 1, 0, item);
  updateFinal();
};

const balanceWeights = () => {
  if (activeLoras.value.length === 0) return;
  const w = 1.0;
  activeLoras.value.forEach((l) => (l.weight = w));
  updateFinal();
};

const duplicateComposition = () => {
  activeLoras.value = activeLoras.value.map((l) => ({ ...l }));
  updateFinal();
};

const buildFinalPrompt = () => {
  const base = basePrompt.value.trim();
  if (!base) return '';
  const parts = [base];
  activeLoras.value.forEach((l) => {
    const w = Number(l.weight ?? 1)
      .toFixed(2)
      .replace(/\.00$/, '.0')
      .replace(/0$/, '');
    parts.push(`<lora:${l.name}:${w}>`);
  });
  if (negativePrompt.value.trim()) {
    parts.push(` --neg ${negativePrompt.value.trim()}`);
  }
  return parts.join(' ');
};

const validate = () => {
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

const updateFinal = () => {
  finalPrompt.value = buildFinalPrompt();
};

const copyPrompt = async () => {
  try {
    updateFinal();
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(finalPrompt.value || '');
    } else {
      const ta = document.createElement('textarea');
      ta.value = finalPrompt.value || '';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  } catch {}
};

const saveComposition = () => {
  const payload = { items: activeLoras.value, base: basePrompt.value, neg: negativePrompt.value };
  lastSaved.value = payload;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
};

const loadComposition = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const payload = raw ? JSON.parse(raw) : lastSaved.value;
    if (!payload) return;
    activeLoras.value = Array.isArray(payload?.items) ? payload.items.map((l) => ({ id: l.id, name: l.name, weight: Number(l.weight) || 1 })) : [];
    basePrompt.value = payload?.base || '';
    negativePrompt.value = payload?.neg || '';
    updateFinal();
  } catch {}
};

const clearComposition = () => {
  activeLoras.value = [];
  updateFinal();
};

const generateImage = async () => {
  if (!validate()) {
    updateFinal();
    return;
  }
  isGenerating.value = true;
  try {
    await fetch('/api/v1/generation/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: finalPrompt.value, negative_prompt: negativePrompt.value, loras: activeLoras.value })
    });
  } catch {}
  finally {
    isGenerating.value = false;
  }
};

onMounted(async () => {
  await loadLoras();
  const payload = data.value;
  const items = Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload) ? payload : []);
  loras.value = items.map((i) => ({ id: i.id, name: i.name, description: i.description, active: i.active ?? true }));
});

// Autosave composition to localStorage for resilience
watch([activeLoras, basePrompt, negativePrompt], () => {
  const payload = { items: activeLoras.value, base: basePrompt.value, neg: negativePrompt.value };
  lastSaved.value = payload;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch {}
}, { deep: true });

</script>
