<template>
  <div class="lora-detail">
    <RouterLink to="/loras" class="text-sm font-medium text-blue-600 hover:text-blue-800">
      ← Back to LoRA collection
    </RouterLink>

    <div v-if="isLoading" class="py-12 text-center text-gray-500" data-testid="lora-detail-loading">
      Loading LoRA…
    </div>

    <div v-else-if="loadError" class="card mt-4 p-6 text-center" data-testid="lora-detail-error">
      <p class="font-medium">{{ loadError }}</p>
    </div>

    <div v-else-if="lora && meta" class="lora-detail-layout" data-testid="lora-detail">
      <div class="lora-detail-media">
        <img
          v-if="meta.previewImage"
          :src="meta.previewImage"
          :alt="lora.name"
          class="lora-detail-image"
          referrerpolicy="no-referrer"
        >
        <div v-else class="lora-detail-image-placeholder">No preview image</div>
      </div>

      <div class="lora-detail-body">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <h1 class="text-2xl font-semibold">{{ lora.name }}</h1>
            <p v-if="lora.version" class="text-sm text-gray-500">Version {{ lora.version }}</p>
          </div>
          <button
            type="button"
            class="btn"
            :class="lora.active ? 'btn-secondary' : 'btn-primary'"
            :disabled="isToggling"
            @click="toggleActive"
          >
            {{ lora.active ? 'Deactivate' : 'Activate' }}
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <span v-if="meta.archetype" class="lora-chip lora-chip-archetype">
            {{ formatArchetypeLabel(meta.archetype) }}
          </span>
          <span v-if="meta.series" class="lora-chip lora-chip-series">{{ meta.series }}</span>
          <span v-if="lora.sd_version" class="lora-chip lora-chip-series">{{ lora.sd_version }}</span>
        </div>

        <section class="lora-detail-section">
          <div class="flex items-center justify-between gap-2">
            <h2 class="lora-detail-heading">Trigger words</h2>
            <button
              v-if="meta.triggers.length > 0"
              type="button"
              class="btn btn-secondary btn-sm"
              @click="copyText(meta.triggers.join(', '))"
            >
              Copy all
            </button>
          </div>
          <ul v-if="meta.triggers.length > 0" class="flex flex-col gap-1" data-testid="lora-detail-triggers">
            <li v-for="trigger in meta.triggers" :key="trigger" class="lora-detail-trigger">
              <code class="lora-detail-trigger-text">{{ trigger }}</code>
              <button
                type="button"
                class="lora-detail-copy"
                :aria-label="`Copy ${trigger}`"
                @click="copyText(trigger)"
              >
                Copy
              </button>
            </li>
          </ul>
          <p v-else class="text-sm text-gray-500">No trigger words listed for this LoRA.</p>
        </section>

        <section v-if="traitRows.length > 0" class="lora-detail-section">
          <h2 class="lora-detail-heading">Appearance</h2>
          <dl class="lora-detail-grid" data-testid="lora-detail-traits">
            <template v-for="row in traitRows" :key="row.key">
              <dt>{{ row.label }}</dt>
              <dd>{{ row.value }}</dd>
            </template>
          </dl>
        </section>

        <section v-if="description" class="lora-detail-section">
          <h2 class="lora-detail-heading">Description</h2>
          <p class="whitespace-pre-line text-sm text-gray-700" data-testid="lora-detail-description">
            {{ description }}
          </p>
        </section>

        <section v-if="meta.displayTags.length > 0" class="lora-detail-section">
          <h2 class="lora-detail-heading">Tags</h2>
          <div class="flex flex-wrap gap-1">
            <span v-for="tag in meta.displayTags" :key="tag" class="lora-chip lora-chip-series">{{ tag }}</span>
          </div>
        </section>

        <section class="lora-detail-section">
          <h2 class="lora-detail-heading">File</h2>
          <dl class="lora-detail-grid">
            <template v-if="lora.primary_file_name">
              <dt>Name</dt>
              <dd class="break-all">{{ lora.primary_file_name }}</dd>
            </template>
            <template v-if="fileSize">
              <dt>Size</dt>
              <dd>{{ fileSize }}</dd>
            </template>
            <dt>Path</dt>
            <dd class="break-all font-mono text-xs">{{ lora.file_path }}</dd>
            <template v-if="lora.primary_file_sha256">
              <dt>SHA256</dt>
              <dd class="break-all font-mono text-xs">{{ lora.primary_file_sha256 }}</dd>
            </template>
            <dt>Weight</dt>
            <dd>{{ lora.weight }}</dd>
          </dl>
        </section>

        <a
          v-if="meta.civitaiUrl"
          :href="meta.civitaiUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-sm font-medium text-blue-600 hover:text-blue-800"
          data-testid="lora-detail-civitai"
        >
          View on CivitAI ↗
        </a>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';

import { fetchAdapterById, toggleLoraActiveState } from '../../services/lora/loraService';
import { useAdapterCatalogStore } from '../../stores/adapterCatalog';
import {
  formatArchetypeLabel,
  getLoraLibraryMeta,
  htmlToPlainText,
  TRAIT_KEYS,
} from '../../utils/libraryMeta';
import { ApiError, useNotifications } from '@/composables/shared';
import { useBackendClient } from '@/services/shared/http';
import type { AdapterRead } from '@/types';
import { formatFileSize } from '@/utils/format';
import { copyPromptToClipboard } from '@/utils/promptClipboard';

defineOptions({ name: 'LoraDetail' });

const props = defineProps<{ loraId: string }>();

const backendClient = useBackendClient();
const catalog = useAdapterCatalogStore();
const { showSuccess, showError } = useNotifications();

const lora = ref<AdapterRead | null>(null);
const isLoading = ref(true);
const loadError = ref<string | null>(null);
const isToggling = ref(false);

const meta = computed(() => (lora.value ? getLoraLibraryMeta(lora.value) : null));
const description = computed(() => htmlToPlainText(lora.value?.description));
const fileSize = computed(() => {
  const kb = lora.value?.primary_file_size_kb;
  return typeof kb === 'number' && kb > 0 ? formatFileSize(kb * 1024, { decimals: 1 }) : null;
});
const traitRows = computed(() =>
  TRAIT_KEYS.filter((key) => meta.value?.traits[key]).map((key) => ({
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    value: meta.value?.traits[key] ?? '',
  })),
);

const load = async (id: string) => {
  isLoading.value = true;
  loadError.value = null;
  try {
    lora.value = await fetchAdapterById(id, backendClient);
  } catch (error) {
    lora.value = null;
    loadError.value =
      error instanceof ApiError && error.status === 404
        ? 'This LoRA was not found. It may have been deleted.'
        : 'Could not load this LoRA.';
  } finally {
    isLoading.value = false;
  }
};

const copyText = async (text: string) => {
  if (await copyPromptToClipboard(text)) {
    showSuccess('Copied to clipboard.', 3000);
  } else {
    showError('Could not copy to clipboard.', 5000);
  }
};

const toggleActive = async () => {
  if (!lora.value || isToggling.value) {
    return;
  }
  isToggling.value = true;
  try {
    const nextActive = !lora.value.active;
    const updated = await toggleLoraActiveState(lora.value.id, nextActive, backendClient);
    lora.value = updated ? { ...lora.value, ...updated } : { ...lora.value, active: nextActive };
    catalog.applyLoraUpdate({ id: lora.value.id, type: 'active', active: lora.value.active });
  } catch {
    showError('Could not change the LoRA state.', 5000);
  } finally {
    isToggling.value = false;
  }
};

watch(
  () => props.loraId,
  (id) => {
    void load(id);
  },
  { immediate: true },
);
</script>

<style scoped>
.lora-detail {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.lora-detail-layout {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 900px) {
  .lora-detail-layout {
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    align-items: start;
  }
}

.lora-detail-image,
.lora-detail-image-placeholder {
  width: 100%;
  max-height: 75vh;
  border-radius: 0.75rem;
  background: var(--color-secondary-100);
  object-fit: contain;
}

.lora-detail-image-placeholder {
  display: flex;
  aspect-ratio: 3 / 4;
  align-items: center;
  justify-content: center;
  color: var(--color-secondary-500);
}

.lora-detail-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 1.25rem;
}

.lora-detail-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.lora-detail-heading {
  color: var(--color-secondary-500);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.lora-detail-grid {
  display: grid;
  gap: 0.375rem 1rem;
  grid-template-columns: max-content minmax(0, 1fr);
  font-size: 0.875rem;
}

.lora-detail-grid dt {
  color: var(--color-secondary-500);
}

.lora-detail-trigger {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.375rem;
  background: var(--color-secondary-50);
  padding: 0.375rem 0.5rem;
}

.lora-detail-trigger-text {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.lora-detail-copy {
  flex-shrink: 0;
  border-radius: 0.25rem;
  padding: 0.125rem 0.5rem;
  color: var(--color-primary-700);
  font-size: 0.75rem;
  font-weight: 500;
}

.lora-detail-copy:hover,
.lora-detail-copy:focus-visible {
  background: var(--color-primary-50);
}

.lora-chip {
  border-radius: 9999px;
  padding: 0.125rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.lora-chip-archetype {
  background: var(--color-primary-100);
  color: var(--color-primary-800);
}

.lora-chip-series {
  background: var(--color-secondary-100);
  color: var(--color-secondary-700);
}
</style>
