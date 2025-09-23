<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="System Administration"
      subtitle="Monitor infrastructure health, job queues, and data pipelines."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/analytics">
          View Analytics
        </RouterLink>
      </template>
    </PageHeader>
    <div class="grid gap-6 xl:grid-cols-2">
      <SystemAdminStatusCard />
      <SystemStatusPanel />
    </div>
    <div class="grid gap-6 xl:grid-cols-2">
      <JobQueue :show-clear-completed="true" />
      <ImportExport />
    </div>
    <div class="grid gap-6 xl:grid-cols-2">
      <PerformanceAnalytics :show-page-header="false" :show-system-status="false" />
      <RecommendationsPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import ImportExport from '@/components/ImportExport.vue';
import JobQueue from '@/components/JobQueue.vue';
import PageHeader from '@/components/PageHeader.vue';
import PerformanceAnalytics from '@/views/analytics/PerformanceAnalyticsPage.vue';
import RecommendationsPanel from '@/components/RecommendationsPanel.vue';
import SystemAdminStatusCard from '@/components/SystemAdminStatusCard.vue';
import SystemStatusPanel from '@/components/SystemStatusPanel.vue';
</script>
