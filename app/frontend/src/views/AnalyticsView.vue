<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Performance Analytics"
      subtitle="Track system load, trends, and workload distribution."
    >
      <template #actions>
        <button class="btn btn-secondary btn-sm" type="button" @click="handleRefresh">
          Refresh Analytics
        </button>
      </template>
    </PageHeader>
    <PerformanceAnalytics :key="refreshKey" />
    <div class="grid gap-6 xl:grid-cols-2">
      <SystemStatusPanel />
      <SystemStatusCard variant="detailed" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

import PageHeader from '@/components/PageHeader.vue';
import PerformanceAnalytics from '@/components/PerformanceAnalytics.vue';
import SystemStatusCard from '@/components/SystemStatusCard.vue';
import SystemStatusPanel from '@/components/SystemStatusPanel.vue';

const refreshKey = ref(0);

const handleRefresh = () => {
  refreshKey.value += 1;
};
</script>
