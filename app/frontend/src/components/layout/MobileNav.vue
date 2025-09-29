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
            <svg class="w-5 h-5 mr-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                v-if="item.icon === 'dashboard'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 12l2-2m0 0 7-7 7 7M13 5v6a2 2 0 0 0 2 2h6"
              />
              <path
                v-else-if="item.icon === 'grid'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h7v7H4V6zm9 0h7v7h-7V6zM4 15h7v7H4v-7zm9 0h7v7h-7v-7z"
              />
              <path
                v-else-if="item.icon === 'spark'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 3l7 7-7 7m8-12 6 6-6 6"
              />
              <path
                v-else-if="item.icon === 'compose'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5M15 3l6 6M8 13h4"
              />
              <path
                v-else-if="item.icon === 'wand'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="m15 7-1 4-4 1 1-4 4-1ZM3 21l6-6"
              />
              <path
                v-else-if="item.icon === 'admin'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zM4 20a8 8 0 0 1 16 0"
              />
              <path
                v-else-if="item.icon === 'bars'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6m8 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10"
              />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
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
