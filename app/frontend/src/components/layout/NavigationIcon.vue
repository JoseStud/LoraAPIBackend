<template>
  <svg v-bind="$attrs" viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path
      :d="iconPath"
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { NavigationIconKey } from '@/config/navigation';

const props = defineProps<{
  icon?: NavigationIconKey | null;
}>();

const ICON_PATHS: Record<NavigationIconKey | 'default', string> = {
  dashboard: 'M3 12V7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v5',
  grid: 'M4 6h7v7H4zM13 6h7v7h-7zM4 15h7v7H4zM13 15h7v7h-7z',
  spark: 'm5 3 7 7-7 7m8-12 6 6-6 6',
  compose: 'M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5M15 3l6 6M8 13h4',
  wand: 'm15 7-1 4-4 1 1-4 4-1ZM3 21l6-6',
  admin: 'M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 8a8 8 0 0 1 16 0',
  bars: 'M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6m8 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10',
  default: 'M4 6h16M4 12h16M4 18h16',
};

const iconPath = computed(() => {
  if (!props.icon) {
    return ICON_PATHS.default;
  }

  return ICON_PATHS[props.icon] ?? ICON_PATHS.default;
});
</script>
