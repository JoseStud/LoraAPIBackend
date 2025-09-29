<template>
  <div class="card h-full">
    <div class="card-body flex flex-col gap-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div class="space-y-1">
          <h3 class="text-lg font-semibold text-gray-900">{{ title }}</h3>
          <p class="text-sm text-gray-500">{{ description }}</p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
          <RouterLink
            v-if="route"
            :to="route"
            class="btn btn-secondary btn-sm"
          >
            {{ ctaLabel }}
          </RouterLink>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :class="{ 'btn-outline': isActive }"
            :disabled="isLoading"
            @click="$emit('toggle')"
          >
            <span v-if="isLoading" class="flex items-center gap-2">
              <span class="loading loading-spinner loading-xs"></span>
              Loading…
            </span>
            <span v-else-if="isActive">
              Hide module
            </span>
            <span v-else>
              {{ loadLabel }}
            </span>
          </button>
        </div>
      </div>

      <div v-if="isActive" class="border-t border-gray-200 pt-4">
        <slot />
      </div>
      <div v-else class="rounded-md border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        <slot name="placeholder">
          Activate this panel to work with the full module without leaving the dashboard.
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

defineProps({
  title: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  route: {
    type: String,
    default: '',
  },
  ctaLabel: {
    type: String,
    default: 'Open full page',
  },
  loadLabel: {
    type: String,
    default: 'Load inline',
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
});

defineEmits<{ (event: 'toggle'): void }>();
</script>
