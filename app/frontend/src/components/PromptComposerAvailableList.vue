<template>
  <div class="card">
    <div class="card-header">
      <h3 class="card-title">Available LoRAs</h3>
    </div>
    <div class="card-body space-y-4">
      <div>
        <input
          class="form-input w-full"
          placeholder="Search LoRAs..."
          :value="searchTerm"
          @input="onSearch"
        />
        <label class="inline-flex items-center gap-2 mt-2 text-sm">
          <input type="checkbox" :checked="activeOnly" @change="onToggleActive" />
          <span>Active Only</span>
        </label>
      </div>

      <div class="space-y-2 max-h-96 overflow-y-auto" data-testid="lora-list">
        <button
          v-for="lora in loras"
          :key="lora.id"
          type="button"
          class="flex w-full items-center justify-between rounded bg-gray-50 p-3 text-left hover:bg-gray-100"
          :class="{ 'opacity-50': isInComposition(lora.id) }"
          @click="emit('select', lora)"
        >
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">{{ lora.name }}</div>
            <div class="truncate text-xs text-gray-500">{{ lora.description || 'No description' }}</div>
          </div>
          <div v-if="lora.active" class="text-xs text-gray-500">Active</div>
        </button>
        <div v-if="!isLoading && !loras.length" class="text-sm text-gray-500">No LoRAs found</div>
        <div v-if="error" class="text-sm text-red-600">Failed to load LoRAs</div>
        <div v-if="isLoading" class="text-sm text-gray-500">Loading…</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';

import type { AdapterSummary } from '@/types';

const props = defineProps<{
  loras: AdapterSummary[];
  searchTerm: string;
  activeOnly: boolean;
  isLoading: boolean;
  error: unknown;
  isInComposition: (id: AdapterSummary['id']) => boolean;
}>();

const emit = defineEmits<{
  (e: 'update:searchTerm', value: string): void;
  (e: 'update:activeOnly', value: boolean): void;
  (e: 'select', value: AdapterSummary): void;
}>();

const { loras, searchTerm, activeOnly, isLoading, error } = toRefs(props);
const isInComposition = props.isInComposition;

const onSearch = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  emit('update:searchTerm', target?.value ?? '');
};

const onToggleActive = (event: Event) => {
  const target = event.target as HTMLInputElement | null;
  emit('update:activeOnly', Boolean(target?.checked));
};
</script>

