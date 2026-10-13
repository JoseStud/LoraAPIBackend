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

      <div class="filter-group">
        <span class="filter-label">Tags:</span>
        <div class="tag-filter-group">
          <label
            v-for="tag in availableTags.slice(0, 5)"
            :key="tag"
            class="checkbox-label"
          >
            <input
              type="checkbox"
              class="form-checkbox"
              :value="tag"
              :checked="selectedTags.includes(tag)"
              @change="onToggleTag(tag, $event)"
            >
            <span class="checkbox-text">{{ tag }}</span>
          </label>
          <button
            v-show="availableTags.length > 5"
            class="more-tags-btn"
            @click="$emit('open-tag-modal')"
          >
            {{ isTagModalOpen ? 'Less' : 'More' }}
          </button>
        </div>
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
  </div>
</template>

<script setup lang="ts">
import type { LoraGallerySortOption } from '@/types';
import { formatArchetypeLabel } from '../../utils/libraryMeta';

defineOptions({ name: 'LoraGalleryFilters' });

const props = withDefaults(defineProps<{
  searchTerm: string;
  activeOnly: boolean;
  selectedTags: string[];
  availableTags: string[];
  sortBy: LoraGallerySortOption;
  isTagModalOpen: boolean;
  selectedArchetype?: string;
  selectedSeries?: string;
  availableArchetypes?: string[];
  availableSeries?: string[];
}>(), {
  selectedArchetype: '',
  selectedSeries: '',
  availableArchetypes: () => [],
  availableSeries: () => [],
});

const emit = defineEmits<{
  (event: 'update:search-term', value: string): void;
  (event: 'update:active-only', value: boolean): void;
  (event: 'update:selected-tags', value: string[]): void;
  (event: 'update:selected-archetype', value: string): void;
  (event: 'update:selected-series', value: string): void;
  (event: 'update:sort-by', value: LoraGallerySortOption): void;
  (event: 'clear-filters'): void;
  (event: 'open-tag-modal'): void;
}>();

const onSearch = (event: Event) => {
  emit('update:search-term', (event.target as HTMLInputElement).value);
};

const clearSearch = () => {
  emit('update:search-term', '');
};

const onToggleActive = (event: Event) => {
  emit('update:active-only', (event.target as HTMLInputElement).checked);
};

const onToggleTag = (tag: string, event: Event) => {
  const isChecked = (event.target as HTMLInputElement).checked;
  const currentTags = new Set(props.selectedTags);
  if (isChecked) {
    currentTags.add(tag);
  } else {
    currentTags.delete(tag);
  }
  emit('update:selected-tags', Array.from(currentTags));
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

.tag-filter-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.375rem 0.75rem;
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

.more-tags-btn {
  color: var(--color-primary-600);
  font-size: 0.8125rem;
  font-weight: 500;
}
</style>
