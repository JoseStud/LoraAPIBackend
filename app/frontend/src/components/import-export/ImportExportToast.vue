<template>
  <div
    v-if="show"
    class="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg transition-all duration-300"
    :class="toastClass"
    role="status"
    aria-live="polite"
  >
    {{ message }}
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type ToastType = 'success' | 'error' | 'warning' | 'info';

const props = defineProps<{
  show: boolean;
  message: string;
  type: ToastType;
}>();

const toastClass = computed(() => {
  const baseClasses = 'text-white';
  switch (props.type) {
    case 'success':
      return `${baseClasses} bg-green-500`;
    case 'error':
      return `${baseClasses} bg-red-500`;
    case 'warning':
      return `${baseClasses} bg-yellow-500`;
    default:
      return `${baseClasses} bg-blue-500`;
  }
});
</script>
