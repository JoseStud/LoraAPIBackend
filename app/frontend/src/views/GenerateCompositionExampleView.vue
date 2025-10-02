<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Component Composition"
      subtitle="Example layout combining prompt and system components."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/generate">
          Back to Studio
        </RouterLink>
      </template>
    </PageHeader>
    <div class="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <PromptComposer />
      <div class="flex flex-col gap-6">
        <SystemStatusCard variant="detailed" />
        <SystemStatusPanel />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import PageHeader from '@/components/layout/PageHeader.vue';
import { PromptComposer } from '@/features/prompt-composer/public';
import { SystemStatusCard, SystemStatusPanel } from '@/features/generation/public';
</script>
