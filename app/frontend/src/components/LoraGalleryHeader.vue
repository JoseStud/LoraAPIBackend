<template>
  <div class="loras-page-header">
    <div>
      <h1 class="page-title">LoRA Collection</h1>
      <p class="page-subtitle">Browse and manage your LoRA adapters</p>
    </div>
    <div class="header-actions">
      <button
        class="btn btn-sm"
        :class="bulkMode ? 'btn-warning' : 'btn-secondary'"
        @click="$emit('toggle-bulk-mode')"
      >
        {{ bulkMode ? 'Exit Bulk' : 'Bulk Actions' }}
      </button>
      <div class="view-mode-toggle">
        <button
          class="view-mode-btn"
          :class="viewMode === 'grid' ? 'active' : ''"
          @click="$emit('change-view-mode', 'grid')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
            ></path>
          </svg>
        </button>
        <button
          class="view-mode-btn"
          :class="viewMode === 'list' ? 'active' : ''"
          @click="$emit('change-view-mode', 'list')"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            ></path>
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LoraGallerySelectionState } from '@/types';

defineOptions({ name: 'LoraGalleryHeader' });

defineProps<{ bulkMode: boolean; viewMode: LoraGallerySelectionState['viewMode'] }>();

defineEmits<{
  (event: 'toggle-bulk-mode'): void;
  (event: 'change-view-mode', mode: LoraGallerySelectionState['viewMode']): void;
}>();
</script>
