<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Generation History"
      subtitle="Review previous runs and manage stored results."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/generate">
          Return to Studio
        </RouterLink>
      </template>
    </PageHeader>
    <div class="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <GenerationHistory />
      <div class="flex flex-col gap-6">
        <JobQueueWidget :show-clear-completed="true" />
        <SystemStatusCard variant="detailed" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { RouterLink } from 'vue-router';

import { GenerationHistory } from '@/features/history/public';
import PageHeader from '@/components/layout/PageHeader.vue';

const loadGenerationWidgets = () => import('@/features/generation/public/widgets');

const JobQueueWidget = defineAsyncComponent({
  loader: () => loadGenerationWidgets().then((module) => module.JobQueueWidget),
  suspensible: false,
});

const SystemStatusCard = defineAsyncComponent({
  loader: () => loadGenerationWidgets().then((module) => module.SystemStatusCard),
  suspensible: false,
});
</script>
