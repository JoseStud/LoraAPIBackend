<template>
  <div class="filters-container">
    <div class="search-bar-container">
      <input
        type="text"
        class="search-input"
        :value="searchTerm"
        placeholder="Search by name, series, trigger words, tags..."
        @input="onSearch"
      >
      <div class="search-icon-container">
        <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          ></path>
        </svg>
      </div>
      <div v-show="searchTerm" class="clear-search-container">
        <button class="clear-search-btn" @click="clearSearch">
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    </div>

    <div class="filter-options-container">
      <div class="filter-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            class="form-checkbox"
            :checked="activeOnly"
            @change="onToggleActive"
          >
          <span class="checkbox-text">Active Only</span>
        </label>
      </div>

      <div v-if="availableArchetypes.length > 0" class="filter-group">
        <label for="filter-archetype" class="filter-label">Archetype:</label>
        <select
          id="filter-archetype"
          class="form-select"
          :value="selectedArchetype"
          @change="emit('update:selected-archetype', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">All</option>
          <option v-for="archetype in availableArchetypes" :key="archetype" :value="archetype">
            {{ formatArchetypeLabel(archetype) }}
          </option>
        </select>
      </div>

      <div v-if="availableSeries.length > 0" class="filter-group">
        <label for="filter-series" class="filter-label">Series:</label>
        <select
          id="filter-series"
          class="form-select"
          :value="selectedSeries"
          @change="emit('update:selected-series', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">All</option>
          <option v-for="series in availableSeries" :key="series" :value="series">
            {{ series }}
          </option>
        </select>
      </div>

      <div class="filter-group">
        <label for="sort-by" class="filter-label">Sort by:</label>
        <select
          id="sort-by"
          class="form-select"
          :value="sortBy"
          @change="onSortChange"
        >
          <option value="name_asc">Name (A-Z)</option>
          <option value="name_desc">Name (Z-A)</option>
          <option value="created_at_desc">Newest</option>
          <option value="created_at_asc">Oldest</option>
          <option value="last_updated_desc">Recently Updated</option>
        </select>
      </div>

      <div class="ml-auto">
        <button class="btn btn-secondary btn-sm" @click="$emit('clear-filters')">
          Clear Filters
        </button>
      </div>
    </div>

    <details v-if="visibleFacets.length > 0" class="facet-panel" data-testid="facet-panel" open>
      <summary class="facet-summary">
        Appearance
        <span v-if="selectedCount > 0" class="facet-selected-count">{{ selectedCount }} selected</span>
      </summary>
      <div v-for="facet in visibleFacets" :key="facet.key" class="facet-row">
        <span class="filter-label facet-label">{{ facet.label }}</span>
        <div class="facet-chips" role="group" :aria-label="facet.label">
          <button
            v-for="option in facet.options"
            :key="option.value"
            type="button"
            class="facet-chip"
            :class="{ 'facet-chip-selected': isSelected(facet.key, option.value) }"
            :aria-pressed="isSelected(facet.key, option.value)"
            :data-facet="`${facet.key}:${option.value}`"
            @click="emit('toggle-facet', facet.key, option.value)"
          >
            {{ option.value }}
            <span class="facet-count">{{ option.count }}</span>
          </button>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { LoraGallerySortOption } from '@/types';
import type { FacetOption, FacetSelection } from '../../composables/lora-gallery/useLoraGalleryFilters';
import {
  FACET_KEYS,
  FACET_LABELS,
  formatArchetypeLabel,
  type FacetKey,
} from '../../utils/libraryMeta';

defineOptions({ name: 'LoraGalleryFilters' });

const props = withDefaults(defineProps<{
  searchTerm: string;
  activeOnly: boolean;
  sortBy: LoraGallerySortOption;
  selectedArchetype?: string;
  selectedSeries?: string;
  availableArchetypes?: string[];
  availableSeries?: string[];
  facetOptions?: Partial<Record<FacetKey, FacetOption[]>>;
  selectedFacets?: FacetSelection;
}>(), {
  selectedArchetype: '',
  selectedSeries: '',
  availableArchetypes: () => [],
  availableSeries: () => [],
  facetOptions: () => ({}),
  selectedFacets: () => ({}),
});

const emit = defineEmits<{
  (event: 'update:search-term', value: string): void;
  (event: 'update:active-only', value: boolean): void;
  (event: 'update:selected-archetype', value: string): void;
  (event: 'update:selected-series', value: string): void;
  (event: 'update:sort-by', value: LoraGallerySortOption): void;
  (event: 'toggle-facet', key: FacetKey, value: string): void;
  (event: 'clear-filters'): void;
}>();

const visibleFacets = computed(() =>
  FACET_KEYS.map((key) => ({ key, label: FACET_LABELS[key], options: props.facetOptions[key] ?? [] }))
    .filter((facet) => facet.options.length > 0),
);

const selectedCount = computed(() =>
  Object.values(props.selectedFacets).reduce((total, values) => total + (values?.length ?? 0), 0),
);

const isSelected = (key: FacetKey, value: string): boolean =>
  (props.selectedFacets[key] ?? []).includes(value);

const onSearch = (event: Event) => {
  emit('update:search-term', (event.target as HTMLInputElement).value);
};

const clearSearch = () => {
  emit('update:search-term', '');
};

const onToggleActive = (event: Event) => {
  emit('update:active-only', (event.target as HTMLInputElement).checked);
};

const onSortChange = (event: Event) => {
  emit('update:sort-by', (event.target as HTMLSelectElement).value as LoraGallerySortOption);
};
</script>

<style scoped>
.filters-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
}

.search-bar-container {
  position: relative;
}

.search-input {
  width: 100%;
  border: 1px solid var(--color-secondary-300);
  border-radius: 0.5rem;
  padding: 0.5rem 2.5rem 0.5rem 2.25rem;
  font-size: 0.875rem;
}

.search-input:focus {
  border-color: var(--color-primary-500);
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.search-icon-container {
  position: absolute;
  top: 50%;
  left: 0.625rem;
  transform: translateY(-50%);
  pointer-events: none;
}

.clear-search-container {
  position: absolute;
  top: 50%;
  right: 0.5rem;
  transform: translateY(-50%);
}

.clear-search-btn {
  display: flex;
  border-radius: 0.25rem;
  padding: 0.125rem;
  color: var(--color-secondary-400);
}

.clear-search-btn:hover {
  color: var(--color-secondary-700);
}

.filter-options-container {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
}

.filter-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.filter-label {
  color: var(--color-secondary-600);
  font-size: 0.8125rem;
  font-weight: 500;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  cursor: pointer;
}

.form-select {
  width: auto;
  max-width: 14rem;
  border: 1px solid var(--color-secondary-300);
  border-radius: 0.375rem;
  padding: 0.25rem 2rem 0.25rem 0.5rem;
  font-size: 0.8125rem;
}

.facet-panel {
  border-top: 1px solid var(--color-secondary-200);
  padding-top: 0.75rem;
}

.facet-summary {
  cursor: pointer;
  color: var(--color-secondary-700);
  font-size: 0.875rem;
  font-weight: 600;
}

.facet-panel[open] .facet-summary {
  margin-bottom: 0.25rem;
}

.facet-selected-count {
  margin-left: 0.375rem;
  border-radius: 9999px;
  background: var(--color-primary-100);
  padding: 0.0625rem 0.5rem;
  color: var(--color-primary-800);
  font-size: 0.75rem;
  font-weight: 500;
}

.facet-row {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 0.5rem;
}

@media (max-width: 640px) {
  .facet-row {
    flex-direction: column;
    gap: 0.25rem;
  }

  .facet-label {
    width: auto;
    padding-top: 0;
  }
}

.facet-label {
  flex-shrink: 0;
  width: 6.5rem;
  padding-top: 0.25rem;
}

.facet-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.facet-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid var(--color-secondary-200);
  border-radius: 9999px;
  background: var(--color-bg-primary, #fff);
  padding: 0.1875rem 0.625rem;
  color: var(--color-secondary-700);
  font-size: 0.8125rem;
}

.facet-chip:hover {
  border-color: var(--color-primary-300);
}

.facet-chip:focus-visible {
  outline: 2px solid var(--color-primary-500);
  outline-offset: 1px;
}

.facet-chip-selected {
  border-color: var(--color-primary-600);
  background: var(--color-primary-600);
  color: #fff;
}

.facet-count {
  color: var(--color-secondary-400);
  font-size: 0.6875rem;
}

.facet-chip-selected .facet-count {
  color: var(--color-primary-100);
}
</style>
