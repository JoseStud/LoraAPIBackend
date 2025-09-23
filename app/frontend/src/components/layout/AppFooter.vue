<template>
  <footer class="main-footer border-t border-slate-200 bg-white/90 py-6">
    <div class="nav-container flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <p class="footer-text m-0">
        LoRA Manager — AI-Powered LoRA Management System
      </p>
      <div class="flex flex-wrap items-center gap-3">
        <RouterLink class="hover:text-slate-700" to="/offline">Offline Mode</RouterLink>
        <a class="hover:text-slate-700" href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
        <a class="hover:text-slate-700" href="mailto:support@example.com">Support</a>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>
