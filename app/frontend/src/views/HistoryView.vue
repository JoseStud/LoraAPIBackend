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
        <JobQueue :show-clear-completed="true" />
        <SystemStatusCard variant="detailed" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import GenerationHistory from '@/components/history/GenerationHistory.vue';
import JobQueue from '@/components/shared/JobQueue.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import SystemStatusCard from '@/components/system/SystemStatusCard.vue';
</script>
