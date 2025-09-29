<template>
  <div class="app-shell min-h-screen bg-slate-50 text-slate-900">
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
import { RouterView } from 'vue-router';

import AppFooter from '@/components/layout/AppFooter.vue';
import AppMainLayout from '@/components/layout/AppMainLayout.vue';
import MainNavigation from '@/components/layout/MainNavigation.vue';
import MobileNav from '@/components/layout/MobileNav.vue';
import Notifications from '@/components/shared/Notifications.vue';
import DialogRenderer from '@/components/shared/DialogRenderer.vue';
</script>
