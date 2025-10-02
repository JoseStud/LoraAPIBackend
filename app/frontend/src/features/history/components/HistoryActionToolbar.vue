<template>
  <div class="page-header">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="page-title">Generation History</h1>
        <p class="page-subtitle">View and manage your generated images</p>
      </div>
      <div class="header-actions">
        <div class="flex items-center space-x-3">
          <div class="view-mode-toggle">
            <button
              type="button"
              @click="setViewMode('grid')"
              :class="viewMode === 'grid' ? 'view-mode-btn active' : 'view-mode-btn'"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
                />
              </svg>
            </button>
            <button
              type="button"
              @click="setViewMode('list')"
              :class="viewMode === 'list' ? 'view-mode-btn active' : 'view-mode-btn'"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>

          <select :value="sortBy" @change="onSortChange" class="form-input text-sm">
            <option value="created_at">Newest First</option>
            <option value="created_at_asc">Oldest First</option>
            <option value="prompt">By Prompt</option>
            <option value="rating">By Rating</option>
          </select>

          <button
            type="button"
            @click="$emit('delete-selected')"
            class="btn btn-danger btn-sm"
            :disabled="selectedCount === 0"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Delete ({{ selectedCount }})
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HistorySortOption } from '../composables/useGenerationHistory';

export type HistoryViewMode = 'grid' | 'list';

const props = defineProps<{
  viewMode: HistoryViewMode;
  sortBy: HistorySortOption;
  selectedCount: number;
}>();

const emit = defineEmits<{
  (event: 'update:viewMode', value: HistoryViewMode): void;
  (event: 'update:sortBy', value: HistorySortOption): void;
  (event: 'sort-change'): void;
  (event: 'delete-selected'): void;
}>();

const setViewMode = (mode: HistoryViewMode): void => {
  if (props.viewMode === mode) {
    return;
  }

  emit('update:viewMode', mode);
};

const onSortChange = (event: Event): void => {
  const target = event.target as HTMLSelectElement | null;
  if (!target) {
    return;
  }

  const value = target.value as HistorySortOption;
  if (value === props.sortBy) {
    emit('sort-change');
    return;
  }

  emit('update:sortBy', value);
  emit('sort-change');
};
</script>
