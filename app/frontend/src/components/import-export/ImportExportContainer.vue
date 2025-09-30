<template>
  <ImportExport />
</template>

<script setup lang="ts">
import { useAsyncLifecycleTask, useNotifications } from '@/composables/shared';

import ImportExport from './ImportExport.vue';

import { provideImportExportContext } from '@/composables/import-export';

const emit = defineEmits<{ (event: 'initialized'): void }>();

const { initialize } = provideImportExportContext();

const { showError } = useNotifications();

useAsyncLifecycleTask(
  async () => {
    await initialize();
    emit('initialized');
  },
  {
    errorMessage: (error) =>
      error instanceof Error
        ? `Failed to initialize the import/export interface: ${error.message}`
        : 'Failed to initialize the import/export interface.',
    notifyError: (message) => {
      showError(message, 8000);
    },
    logLabel: '[ImportExport] Initialization',
  },
);
</script>
