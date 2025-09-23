<template>
  <div
    v-if="visible"
    class="fixed top-4 right-4 z-50 text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-300"
    :class="computedClasses"
  >
    <slot>{{ message }}</slot>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type ToastType = 'success' | 'error' | 'info' | 'warning';

const props = defineProps<{
  visible: boolean;
  message: string;
  type?: ToastType;
}>();

const classesByType: Record<ToastType, string> = {
  success: 'bg-green-500',
  error: 'bg-red-500',
  info: 'bg-blue-500',
  warning: 'bg-yellow-500 text-gray-900',
};

const computedClasses = computed(() => classesByType[props.type ?? 'success']);
</script>
