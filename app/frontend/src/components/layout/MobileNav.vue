<template>
  <div class="mobile-nav-root">
    <button
      class="mobile-nav-toggle lg:hidden touch-target"
      :class="{ 'mobile-safe-top': true }"
      :aria-expanded="isOpen"
      aria-controls="mobile-navigation"
      aria-label="Toggle mobile navigation menu"
      @click="toggleMenu"
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          :d="isOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'"
        />
      </svg>
      <span class="sr-only">{{ isOpen ? 'Close menu' : 'Open menu' }}</span>
    </button>

    <div v-show="isOpen" @click="closeMenu" class="mobile-nav-overlay" />

    <nav
      class="mobile-nav-menu"
      id="mobile-navigation"
      :class="isOpen ? 'open' : 'closed'"
      role="navigation"
      aria-label="Mobile navigation"
      :aria-hidden="!isOpen"
    >
      <div class="mobile-nav-header mobile-safe-top">
        <h2 class="text-lg font-semibold text-white">LoRA Manager</h2>
        <button @click="closeMenu" class="mobile-nav-close touch-target" aria-label="Close navigation menu">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="mobile-nav-links">
        <RouterLink
          v-for="item in items"
          :key="item.path"
          :to="item.path"
          class="mobile-nav-link"
          :class="{ active: currentPath === item.path }"
          @click="closeMenu"
        >
          <span class="inline-flex items-center">
            <NavigationIcon class="w-5 h-5 mr-3 inline" :icon="item.icon" />
            {{ item.label }}
          </span>
        </RouterLink>
      </div>

      <div class="mobile-safe-bottom border-t border-gray-200 p-4 text-xs text-gray-500">
        LoRA Manager v2.1
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

import { NAVIGATION_ITEMS } from '@/config/navigation';

import NavigationIcon from './NavigationIcon.vue';

const isOpen = ref(false);
const items = NAVIGATION_ITEMS;
const route = useRoute();

const currentPath = computed(() => route.path.replace(/\/+$/, '') || '/');

const toggleMenu = () => {
  isOpen.value = !isOpen.value;
};

const closeMenu = () => {
  isOpen.value = false;
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeMenu();
  }
};

watch(
  () => route.fullPath,
  () => {
    closeMenu();
  }
);

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKeydown);
  }
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKeydown);
  }
});
</script>

<style scoped>
/* No component-scoped overrides required */
</style>
