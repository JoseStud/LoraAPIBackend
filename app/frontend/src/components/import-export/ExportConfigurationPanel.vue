<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ExportDataSelectionForm :config="config" @update-config="onUpdateConfig" />
      <ExportSettingsForm
        :config="config"
        :estimated-size="estimatedSize"
        :estimated-time="estimatedTime"
        @update-config="onUpdateConfig"
      />
    </div>

    <ExportWorkflowActions />
  </div>
</template>

<script setup lang="ts">
import ExportDataSelectionForm from './ExportDataSelectionForm.vue';
import ExportSettingsForm from './ExportSettingsForm.vue';
import ExportWorkflowActions from './ExportWorkflowActions.vue';

import type { ExportConfig } from '@/types';

import { useImportExportContext } from '@/composables/import-export';

const {
  exportWorkflow: { exportConfig: config, estimatedSize, estimatedTime },
  actions: { updateExportConfig }
} = useImportExportContext();

const onUpdateConfig = <K extends keyof ExportConfig>(key: K, value: ExportConfig[K]) => {
  updateExportConfig(key, value);
};
</script>
