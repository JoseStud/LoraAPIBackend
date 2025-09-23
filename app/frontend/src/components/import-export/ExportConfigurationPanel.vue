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

    <ExportWorkflowActions
      :can-export="canExport"
      :is-exporting="isExporting"
      @validate="$emit('validate')"
      @preview="$emit('preview')"
      @start="$emit('start')"
    />
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';

import ExportDataSelectionForm from './ExportDataSelectionForm.vue';
import ExportSettingsForm from './ExportSettingsForm.vue';
import ExportWorkflowActions from './ExportWorkflowActions.vue';

import type { ExportConfig } from '@/composables/import-export';

type UpdateConfigEmitter<TConfig> = {
  <K extends keyof TConfig>(event: 'update-config', key: K, value: TConfig[K]): void;
};

const props = defineProps<{
  config: ExportConfig;
  canExport: boolean;
  estimatedSize: string;
  estimatedTime: string;
  isExporting: boolean;
}>();

const { config, canExport, estimatedSize, estimatedTime, isExporting } = toRefs(props);

const emit = defineEmits<
  UpdateConfigEmitter<ExportConfig> & {
    (e: 'validate'): void;
    (e: 'preview'): void;
    (e: 'start'): void;
  }
>();

const onUpdateConfig = <K extends keyof ExportConfig>(key: K, value: ExportConfig[K]) => {
  emit('update-config', key, value);
};
</script>
