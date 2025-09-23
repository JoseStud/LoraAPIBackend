<template>
  <div class="app-shell min-h-screen bg-slate-50 text-slate-900">
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <a class="skip-link" href="#navigation">Skip to navigation</a>

    <MobileNav />
    <MainNavigation />

    <main id="main-content" class="main-content" tabindex="-1">
      <div class="content-wrapper px-4 pb-12 pt-8">
        <header class="flex flex-col gap-2 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 class="text-3xl font-semibold tracking-tight text-slate-900">LoRA Manager</h1>
            <p class="text-sm text-slate-600">
              Monitor system status, manage jobs, and explore recommendations.
            </p>
          </div>
          <div class="hidden items-center gap-2 sm:flex">
            <RouterLink class="btn btn-secondary btn-sm" to="/loras">Browse LoRAs</RouterLink>
            <RouterLink class="btn btn-primary btn-sm" to="/generate">Open Generation Studio</RouterLink>
          </div>
        </header>

        <RouterView />
      </div>
    </main>

    <AppFooter />
    <Notifications />
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';

import AppFooter from '@/components/layout/AppFooter.vue';
import MainNavigation from '@/components/layout/MainNavigation.vue';
import MobileNav from '@/components/layout/MobileNav.vue';
import Notifications from '@/components/shared/Notifications.vue';
</script>
