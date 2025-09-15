<template>
  <div class="mobile-nav-root">
    <!-- Mobile Navigation Toggle -->
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

    <!-- Mobile Navigation Overlay -->
    <div
      v-show="isOpen"
      @click="closeMenu"
      class="mobile-nav-overlay"
    />

    <!-- Mobile Navigation Menu -->
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
        <button
          @click="closeMenu"
          class="mobile-nav-close touch-target"
          aria-label="Close navigation menu"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="mobile-nav-links">
        <a
          v-for="item in items"
          :key="item.path"
          :href="item.path"
          @click="closeMenu"
          class="mobile-nav-link"
          :class="{ 'active': isActive(item.path) }"
        >
          <span class="inline-flex items-center">
            <svg class="w-5 h-5 mr-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path v-if="item.icon === 'dashboard'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M13 5v6a2 2 0 002 2h6" />
              <path v-else-if="item.icon === 'grid'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h7v7H4V6zm9 0h7v7h-7V6zM4 15h7v7H4v-7zm9 0h7v7h-7v-7z" />
              <path v-else-if="item.icon === 'spark'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l7 7-7 7M13 5l6 6-6 6" />
              <path v-else-if="item.icon === 'compose'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M15 3l6 6M8 13h4" />
              <path v-else-if="item.icon === 'wand'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7l-1 4-4 1 1-4 4-1zM3 21l6-6" />
              <path v-else-if="item.icon === 'admin'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 12c2.21 0 4-1.79 4-4S14.21 4 12 4 8 5.79 8 8s1.79 4 4 4z M4 20a8 8 0 0116 0" />
              <path v-else-if="item.icon === 'bars'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m8 0V9a2 2 0 012-2h2a2 2 0 012 2v10" />
              <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {{ item.label }}
          </span>
        </a>
      </div>

      <div class="p-4 border-t border-gray-200 mobile-safe-bottom">
        <div class="text-xs text-gray-500">LoRA Manager v2.1</div>
      </div>
    </nav>
  </div>
  
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';

const isOpen = ref(false);

const items = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/loras', label: 'LoRAs', icon: 'grid' },
  { path: '/recommendations', label: 'Recommendations', icon: 'spark' },
  { path: '/compose', label: 'Compose', icon: 'compose' },
  { path: '/generate', label: 'Generate', icon: 'wand' },
  { path: '/admin', label: 'Admin', icon: 'admin' },
  { path: '/analytics', label: 'Analytics', icon: 'bars' },
  { path: '/import-export', label: 'Import/Export', icon: 'grid' },
];

const toggleMenu = () => { isOpen.value = !isOpen.value; };
const closeMenu = () => { isOpen.value = false; };

const isActive = (path) => {
  try {
    return (window?.location?.pathname || '').replace(/\/+$/, '') === path;
  } catch { return false; }
};

const onKeydown = (e) => {
  if (e.key === 'Escape') closeMenu();
};

onMounted(() => {
  document.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
});
</script>

<style scoped>
/* Rely on existing app styles; no overrides here */
</style>
