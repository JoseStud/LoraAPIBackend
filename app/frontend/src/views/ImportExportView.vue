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
    <LazyImportExportContainer @initialized="handleImportExportInitialized" />
    <div v-if="arePanelsReady" class="grid gap-6 xl:grid-cols-2">
      <JobQueueWidget :show-clear-completed="true" />
      <SystemStatusPanel />
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue';
import { RouterLink } from 'vue-router';

import { JobQueueWidget, SystemStatusPanel } from '@/features/generation/public';
import PageHeader from '@/components/layout/PageHeader.vue';
import { ImportExportSkeleton } from '@/features/import-export/public';

const LazyImportExportContainer = defineAsyncComponent({
  loader: () => import('@/features/import-export/public').then((module) => module.ImportExportContainer),
  loadingComponent: ImportExportSkeleton,
  delay: 0,
  suspensible: false
});

const arePanelsReady = ref(false);

const handleImportExportInitialized = () => {
  arePanelsReady.value = true;
};
</script>
