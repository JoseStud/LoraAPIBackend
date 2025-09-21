<template>
  <div class="offline-feature-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
    <div class="flex items-center space-x-3">
      <div class="flex-shrink-0">
        <svg class="h-6 w-6" :class="iconColor" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="iconPath" />
        </svg>
      </div>
      <div class="flex-1 text-left">
        <div class="font-medium text-slate-900">{{ title }}</div>
        <div class="text-sm text-slate-600">{{ description }}</div>
      </div>
      <button
        v-if="ctaLabel"
        type="button"
        class="btn btn-sm btn-secondary"
        @click="$emit('cta')"
      >
        {{ ctaLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
interface OfflineFeatureCardProps {
  title: string;
  description: string;
  iconPath: string;
  iconColor?: string;
  ctaLabel?: string;
}

defineEmits<{ (event: 'cta'): void }>();

defineProps<OfflineFeatureCardProps>();
</script>
