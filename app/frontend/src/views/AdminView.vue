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
      <ImportExportContainer />
    </div>
    <div class="grid gap-6 xl:grid-cols-2">
      <PerformanceAnalytics :show-page-header="false" :show-system-status="false" />
      <RecommendationsPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import ImportExportContainer from '@/components/import-export/ImportExportContainer.vue';
import JobQueue from '@/components/shared/JobQueue.vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import PerformanceAnalytics from '@/views/analytics/PerformanceAnalyticsPage.vue';
import RecommendationsPanel from '@/components/recommendations/RecommendationsPanel.vue';
import SystemAdminStatusCard from '@/components/system/SystemAdminStatusCard.vue';
import SystemStatusPanel from '@/components/system/SystemStatusPanel.vue';
</script>
