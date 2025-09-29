<template>
  <nav
    id="navigation"
    class="main-nav hidden lg:block"
    role="navigation"
    aria-label="Main navigation"
  >
    <div class="nav-container">
      <div class="nav-header">
        <RouterLink
          to="/"
          class="nav-title flex items-center gap-2 text-slate-900"
          aria-label="Go to dashboard"
        >
          <svg class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5Z" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M2 17l10 5 10-5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M2 12l10 5 10-5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>LoRA Manager</span>
        </RouterLink>
        <span class="hidden text-sm text-gray-500 xl:inline">
          Manage LoRAs · catalog · recommendations · generation
        </span>
        <div class="nav-actions flex items-center gap-2">
          <form class="hidden items-center gap-2 md:flex" role="search" @submit.prevent="handleSearch">
            <label class="sr-only" for="global-search">Search LoRAs</label>
            <input
              id="global-search"
              v-model="searchQuery"
              type="search"
              placeholder="Search LoRAs, tags, models..."
              class="form-input w-56"
              autocomplete="off"
            />
            <button class="btn btn-secondary btn-icon" type="submit" :disabled="!canSearch">
              <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
              <span class="sr-only">Submit search</span>
            </button>
          </form>

          <button
            class="btn btn-secondary btn-icon"
            type="button"
            :aria-label="themeToggleLabel"
            @click="toggleTheme"
          >
            <svg v-if="currentTheme === 'dark'" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
            </svg>
            <svg v-else class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v2m0 14v2m9-9h-2M7 12H5m15.364 6.364-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0-1.414 1.414M7.05 16.95l-1.414 1.414M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" />
            </svg>
            <span class="sr-only">Toggle theme</span>
          </button>

        </div>
      </div>

      <div class="nav-links hidden items-center gap-1 lg:flex">
        <RouterLink
          v-for="item in items"
          :key="item.path"
          :to="item.path"
          class="nav-link"
          :class="{ active: currentPath === item.path }"
        >
          <span class="inline-flex items-center gap-2">
            <NavigationIcon class="h-4 w-4" :icon="item.icon" />
            {{ item.label }}
          </span>
        </RouterLink>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';

import { useAppStore } from '@/stores';
import { useTheme } from '@/composables/shared';
import { NAVIGATION_ITEMS } from '@/config/navigation';

import NavigationIcon from './NavigationIcon.vue';

const appStore = useAppStore();
const router = useRouter();
const route = useRoute();
const { currentTheme, toggleTheme } = useTheme();

const searchQuery = ref('');
const items = NAVIGATION_ITEMS;

const currentPath = computed(() => route.path.replace(/\/+$/, '') || '/');
const canSearch = computed(() => searchQuery.value.trim().length > 1);

const themeToggleLabel = computed(() =>
  currentTheme.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
);

const handleSearch = () => {
  if (!canSearch.value) {
    return;
  }

  const query = searchQuery.value.trim();
  searchQuery.value = '';

  router.push({ name: 'loras', query: { q: query } }).catch(() => {
    router.push('/loras');
  });

  appStore.addNotification(`Searching for "${query}"`, 'info', 2500);
};
</script>

<style scoped>
.nav-actions {
  display: flex;
}
</style>
