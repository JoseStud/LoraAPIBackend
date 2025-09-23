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

          <RouterLink to="/account" class="btn btn-icon" aria-label="Account">
            <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20a8 8 0 0 1 16 0" />
            </svg>
          </RouterLink>
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
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                v-if="item.icon === 'dashboard'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 12V7a2 2 0 0 1 2-2h3l2-2h4l2 2h3a2 2 0 0 1 2 2v5"
              />
              <path
                v-else-if="item.icon === 'grid'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h7v7H4zM13 6h7v7h-7zM4 15h7v7H4zM13 15h7v7h-7z"
              />
              <path
                v-else-if="item.icon === 'spark'"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="m5 3 7 7-7 7m8-12 6 6-6 6"
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
                d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm-8 8a8 8 0 0 1 16 0"
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
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';

import { useAppStore } from '@/stores/app';
import { useTheme } from '@/composables/useTheme';

interface NavItem {
  path: string;
  label: string;
  icon:
    | 'dashboard'
    | 'grid'
    | 'spark'
    | 'compose'
    | 'wand'
    | 'admin'
    | 'bars';
}

const NAV_ITEMS: readonly NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/loras', label: 'LoRAs', icon: 'grid' },
  { path: '/recommendations', label: 'Recommendations', icon: 'spark' },
  { path: '/compose', label: 'Compose', icon: 'compose' },
  { path: '/generate', label: 'Generate', icon: 'wand' },
  { path: '/admin', label: 'Admin', icon: 'admin' },
  { path: '/analytics', label: 'Analytics', icon: 'bars' },
  { path: '/import-export', label: 'Import/Export', icon: 'grid' },
];

const appStore = useAppStore();
const router = useRouter();
const route = useRoute();
const { currentTheme, toggleTheme } = useTheme();

const searchQuery = ref('');
const items = NAV_ITEMS;

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
