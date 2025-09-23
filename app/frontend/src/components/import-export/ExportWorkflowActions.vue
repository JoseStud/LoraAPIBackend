<template>
  <div class="flex justify-between items-center pt-6 border-t">
    <div class="flex items-center space-x-4">
      <button class="btn btn-secondary" @click="$emit('validate')">
        Validate Selection
      </button>
      <button class="btn btn-secondary" @click="$emit('preview')">
        Preview Contents
      </button>
    </div>
    <button
      class="btn btn-primary"
      :disabled="!canExport || isExporting"
      @click="$emit('start')"
    >
      <template v-if="!isExporting">
        <span>Start Export</span>
      </template>
      <template v-else>
        <div class="flex items-center">
          <svg class="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
          </svg>
          Exporting...
        </div>
      </template>
    </button>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';

const props = defineProps<{
  canExport: boolean;
  isExporting: boolean;
}>();

const { canExport, isExporting } = toRefs(props);

defineEmits<{ (e: 'validate'): void; (e: 'preview'): void; (e: 'start'): void }>();
</script>
