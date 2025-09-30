<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Generation Studio"
      subtitle="Launch image generations and monitor live progress."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/compose">
          Edit Prompt Composition
        </RouterLink>
      </template>
    </PageHeader>
    <div class="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <GenerationStudio />
      <div class="flex flex-col gap-6">
        <SystemStatusCard variant="detailed" />
        <JobQueue :show-clear-completed="true" />
        <RecommendationsPanel />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import { GenerationStudio, JobQueue, SystemStatusCard } from '@/features/generation/public';
import PageHeader from '@/components/layout/PageHeader.vue';
import { RecommendationsPanel } from '@/features/recommendations';
</script>
