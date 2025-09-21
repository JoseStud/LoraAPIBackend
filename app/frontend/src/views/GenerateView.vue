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

import GenerationStudio from '@/components/GenerationStudio.vue';
import JobQueue from '@/components/JobQueue.vue';
import PageHeader from '@/components/PageHeader.vue';
import RecommendationsPanel from '@/components/RecommendationsPanel.vue';
import SystemStatusCard from '@/components/SystemStatusCard.vue';
</script>
