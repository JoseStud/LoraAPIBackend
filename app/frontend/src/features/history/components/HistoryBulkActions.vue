<template>
  <div
    v-if="selectedCount > 0"
    class="transition-all duration-300 ease-out opacity-100 transform translate-y-0 bulk-actions-bar mb-4"
  >
    <div class="flex items-center justify-between">
      <span class="text-sm text-gray-700">
        {{ selectedCount }} items selected
      </span>
      <div class="flex space-x-2">
        <button @click="$emit('favorite')" class="btn btn-secondary btn-sm">
          Add to Favorites
        </button>
        <button @click="$emit('export')" class="btn btn-secondary btn-sm">
          Export
        </button>
        <button @click="$emit('clear')" class="btn btn-secondary btn-sm">
          Clear
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  selectedCount: number;
}>();

defineEmits<{
  (e: 'favorite'): void;
  (e: 'export'): void;
  (e: 'clear'): void;
}>();
</script>
