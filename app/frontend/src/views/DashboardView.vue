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

    <section class="grid gap-6 xl:grid-cols-2">
      <ImportExport />
      <HelloWorld />
    </section>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import GenerationHistory from '@/components/GenerationHistory.vue';
import GenerationStudio from '@/components/GenerationStudio.vue';
import HelloWorld from '@/components/HelloWorld.vue';
import ImportExport from '@/components/ImportExport.vue';
import JobQueue from '@/components/JobQueue.vue';
import LoraGallery from '@/components/LoraGallery.vue';
import PageHeader from '@/components/PageHeader.vue';
import PerformanceAnalytics from '@/views/analytics/PerformanceAnalyticsPage.vue';
import PromptComposer from '@/components/PromptComposer.vue';
import RecommendationsPanel from '@/components/RecommendationsPanel.vue';
import SystemAdminStatusCard from '@/components/SystemAdminStatusCard.vue';
import SystemStatusCard from '@/components/SystemStatusCard.vue';
import SystemStatusPanel from '@/components/SystemStatusPanel.vue';
</script>
