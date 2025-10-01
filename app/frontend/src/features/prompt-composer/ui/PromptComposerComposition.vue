<template>
  <div class="space-y-4">
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Composition</h3>
      </div>
      <div class="card-body space-y-3" data-testid="composition">
        <div
          v-for="(entry, index) in items"
          :key="entry.id"
          class="rounded border bg-white p-3"
        >
          <div class="flex items-center gap-2">
            <div class="flex-1 truncate font-medium">{{ entry.name }}</div>
            <button
              class="btn btn-secondary btn-xs"
              type="button"
              data-testid="move-up"
              :disabled="index === 0"
              @click="emit('move-up', index)"
            >
              ↑
            </button>
            <button
              class="btn btn-secondary btn-xs"
              type="button"
              data-testid="move-down"
              :disabled="index === items.length - 1"
              @click="emit('move-down', index)"
            >
              ↓
            </button>
            <button
              class="btn btn-secondary btn-xs"
              type="button"
              data-testid="remove-entry"
              @click="emit('remove', index)"
            >
              ✕
            </button>
          </div>
          <div class="mt-2">
            <label class="text-xs">Weight: {{ entry.weight.toFixed(2) }}</label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              :value="entry.weight"
              data-testid="weight-slider"
              @input="onWeightInput(index, $event)"
              class="w-full"
            />
          </div>
        </div>
        <div v-if="!items.length" class="text-sm text-gray-500">No LoRAs in composition</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="card-title">Quick Actions</h3>
      </div>
      <div class="card-body space-y-2">
        <button class="btn btn-secondary btn-sm w-full" type="button" :disabled="!items.length" @click="emit('balance')">
          Balance All Weights
        </button>
        <button class="btn btn-secondary btn-sm w-full" type="button" :disabled="!items.length" @click="emit('duplicate')">
          Duplicate Composition
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';

import type { CompositionEntry } from '@/types';

const props = defineProps<{
  items: CompositionEntry[];
}>();

const emit = defineEmits<{
  (e: 'remove', index: number): void;
  (e: 'move-up', index: number): void;
  (e: 'move-down', index: number): void;
  (e: 'update-weight', payload: { index: number; weight: number }): void;
  (e: 'balance'): void;
  (e: 'duplicate'): void;
}>();

const { items } = toRefs(props);

const onWeightInput = (index: number, event: Event) => {
  const target = event.target as HTMLInputElement | null;
  const value = target ? Number(target.value) : 0;
  emit('update-weight', { index, weight: value });
};
</script>

