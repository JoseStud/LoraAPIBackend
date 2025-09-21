<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Import & Export"
      subtitle="Manage backups, bulk imports, and data synchronization."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/loras">
          Return to Library
        </RouterLink>
      </template>
    </PageHeader>
    <ImportExport />
    <div class="grid gap-6 xl:grid-cols-2">
      <JobQueue :show-clear-completed="true" />
      <SystemStatusPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import ImportExport from '@/components/ImportExport.vue';
import JobQueue from '@/components/JobQueue.vue';
import PageHeader from '@/components/PageHeader.vue';
import SystemStatusPanel from '@/components/SystemStatusPanel.vue';
</script>
