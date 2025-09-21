<template>
  <div class="app-shell min-h-screen bg-slate-50 text-slate-900">
    <MobileNav />
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-10 pt-6">
      <header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-3xl font-semibold tracking-tight text-slate-900">LoRA Manager</h1>
          <p class="text-sm text-slate-600">
            Monitor system status, manage jobs, and explore recommendations.
          </p>
        </div>
      </header>
      <main class="flex-1">
        <RouterView />
      </main>
    </div>
    <Notifications />
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';

import MobileNav from '@/components/MobileNav.vue';
import Notifications from '@/components/Notifications.vue';
</script>
