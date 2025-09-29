<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Dashboard Overview"
      subtitle="Monitor system health, track jobs, and explore LoRA insights at a glance."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/loras">
          Browse LoRAs
        </RouterLink>
      </template>
    </PageHeader>

    <section class="grid gap-6 lg:grid-cols-2">
      <SystemStatusCard variant="detailed" />
      <SystemAdminStatusCard />
    </section>

    <section class="grid gap-6 lg:grid-cols-2">
      <JobQueue :show-clear-completed="true" />
      <RecommendationsPanel />
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <PerformanceAnalytics :show-page-header="false" :show-system-status="false" />
      <SystemStatusPanel />
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <PromptComposer />
      <GenerationStudio />
    </section>

    <section class="grid gap-6 xl:grid-cols-2">
      <LoraGallery />
      <GenerationHistory />
    </section>

    <section class="grid gap-6">
      <ImportExportContainer />
    </section>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import { defineAsyncComponent } from 'vue';

import GenerationHistory from '@/components/history/GenerationHistory.vue';
import GenerationStudio from '@/components/generation/GenerationStudio.vue';
import ImportExportContainer from '@/components/import-export/ImportExportContainer.vue';
import JobQueue from '@/components/shared/JobQueue.vue';
import LoraGallery from '@/components/lora-gallery/LoraGallery.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import PromptComposer from '@/components/compose/PromptComposer.vue';
import RecommendationsPanel from '@/components/recommendations/RecommendationsPanel.vue';
import SystemAdminStatusCard from '@/components/system/SystemAdminStatusCard.vue';
import SystemStatusCard from '@/components/system/SystemStatusCard.vue';
import SystemStatusPanel from '@/components/system/SystemStatusPanel.vue';

const PerformanceAnalytics = defineAsyncComponent(
  () => import('@/views/analytics/PerformanceAnalyticsPage.vue'),
);
</script>
