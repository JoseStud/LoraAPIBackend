<template>
  <div class="app-shell min-h-screen bg-slate-50 text-slate-900">
    <transition name="fade">
      <div
        v-if="showSettingsLoading"
        class="settings-loading-banner fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 bg-slate-900/90 py-2 text-sm text-slate-100 shadow"
        role="status"
        aria-live="polite"
      >
        <span class="loading loading-spinner loading-xs" aria-hidden="true"></span>
        <span>Loading configuration…</span>
      </div>
    </transition>

    <a class="skip-link" href="#main-content">Skip to main content</a>
    <a class="skip-link" href="#navigation">Skip to navigation</a>

    <MobileNav />
    <MainNavigation />

    <main id="main-content" class="main-content" tabindex="-1">
      <RouterView v-slot="{ Component }">
        <AppMainLayout>
          <component :is="Component" />
        </AppMainLayout>
      </RouterView>
    </main>

    <AppFooter />
    <Notifications />
    <DialogRenderer />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { RouterView } from 'vue-router';

import AppFooter from '@/components/layout/AppFooter.vue';
import AppMainLayout from '@/components/layout/AppMainLayout.vue';
import MainNavigation from '@/components/layout/MainNavigation.vue';
import MobileNav from '@/components/layout/MobileNav.vue';
import Notifications from '@/components/shared/Notifications.vue';
import DialogRenderer from '@/components/shared/DialogRenderer.vue';
import { useSettingsStore } from '@/stores';

const settingsStore = useSettingsStore();
const { isLoading, isLoaded } = storeToRefs(settingsStore);

const showSettingsLoading = computed(() => isLoading.value && !isLoaded.value);
</script>
