<template>
  <header class="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-start gap-3">
      <div v-if="$slots.icon" class="mt-1 text-blue-600">
        <slot name="icon" />
      </div>
      <div>
        <h1 class="page-title text-2xl font-semibold text-slate-900">{{ title }}</h1>
        <p v-if="subtitle" class="page-subtitle text-sm text-slate-600">{{ subtitle }}</p>
        <div v-if="$slots.default" class="mt-2 text-sm text-slate-600">
          <slot />
        </div>
      </div>
    </div>
    <div v-if="$slots.actions" class="flex flex-wrap gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

defineProps<PageHeaderProps>();
</script>
