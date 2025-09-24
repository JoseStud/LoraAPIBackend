<template>
  <ImportExport
    :is-initialized="isInitialized"
    :active-tab="activeTab"
    :export-config="exportConfig"
    :can-export="canExport"
    :estimated-size="estimatedSize"
    :estimated-time="estimatedTime"
    :is-exporting="isExporting"
    :import-config="importConfig"
    :import-files="importFiles"
    :import-preview="importPreview"
    :has-encrypted-files="hasEncryptedFiles"
    :is-importing="isImporting"
    :backup-history="backupHistory"
    :migration-config="migrationConfig"
    :show-progress="showProgress"
    :progress-title="progressTitle"
    :progress-value="progressValue"
    :current-step="currentStep"
    :progress-messages="progressMessages"
    :show-toast="showToast"
    :toast-message="toastMessage"
    :toast-type="toastType"
    :format-file-size="formatFileSize"
    :format-date="formatDate"
    :get-status-classes="getStatusClasses"
    @update:active-tab="handleActiveTabChange"
    @quick-export-all="handleQuickExportAll"
    @view-history="handleViewHistory"
    @update-export-config="handleExportConfigUpdate"
    @validate-export="handleValidateExport"
    @preview-export="handlePreviewExport"
    @start-export="handleStartExport"
    @update-import-config="handleImportConfigUpdate"
    @add-import-files="handleImportFilesAdded"
    @remove-import-file="handleImportFileRemoved"
    @analyze-files="handleAnalyzeFiles"
    @validate-import="handleValidateImport"
    @start-import="handleStartImport"
    @create-full-backup="handleCreateFullBackup"
    @create-quick-backup="handleCreateQuickBackup"
    @schedule-backup="handleScheduleBackup"
    @download-backup="handleDownloadBackup"
    @restore-backup="handleRestoreBackup"
    @delete-backup="handleDeleteBackup"
    @update-migration-config="handleMigrationConfigUpdate"
    @start-version-migration="handleStartVersionMigration"
    @start-platform-migration="handleStartPlatformMigration"
    @cancel-operation="handleCancelOperation"
  />
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';

import ImportExport, { type ActiveTab } from './ImportExport.vue';

import { useBackupWorkflow } from '@/composables/useBackupWorkflow';
import { useExportWorkflow } from '@/composables/useExportWorkflow';
import { useImportWorkflow } from '@/composables/useImportWorkflow';
import { useMigrationWorkflow } from '@/composables/useMigrationWorkflow';
import { useOperationProgress } from '@/composables/useOperationProgress';
import { useImportExportActions } from '@/composables/useImportExportActions';
import { useWorkflowToast } from '@/composables/useWorkflowToast';
import { formatDateTime, formatFileSize as formatBytes } from '@/utils/format';

const emit = defineEmits<{ (event: 'initialized'): void }>();

const isInitialized = ref(false);
const activeTab = ref<ActiveTab>('export');

const { showToast, toastMessage, toastType, notify: notifyWithToast } = useWorkflowToast();
const {
  showProgress,
  progressTitle,
  progressValue,
  currentStep,
  progressMessages,
  currentOperation,
  begin,
  update,
  end
} = useOperationProgress();

const exportWorkflow = useExportWorkflow({
  notify: notifyWithToast,
  progress: { begin: () => begin('export'), update, end }
});
const {
  exportConfig,
  canExport,
  estimatedSize,
  estimatedTime,
  isExporting,
  initialize: initializeExport
} = exportWorkflow;

const importWorkflow = useImportWorkflow({
  notify: notifyWithToast,
  progress: { begin: () => begin('import'), update, end }
});
const {
  importConfig,
  importFiles,
  importPreview,
  hasEncryptedFiles,
  isImporting
} = importWorkflow;

const backupWorkflow = useBackupWorkflow({ notify: notifyWithToast });
const { backupHistory, initialize: initializeBackup } = backupWorkflow;

const migrationWorkflow = useMigrationWorkflow({ notify: notifyWithToast });
const { migrationConfig } = migrationWorkflow;

const formatFileSize = (bytes: number) => formatBytes(typeof bytes === 'number' ? bytes : 0);
const formatDate = (dateString: string) =>
  formatDateTime(dateString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

const statusClasses: Record<string, string> = {
  new: 'bg-green-100 text-green-800',
  conflict: 'bg-yellow-100 text-yellow-800',
  existing: 'bg-gray-100 text-gray-800',
  error: 'bg-red-100 text-red-800'
};
const getStatusClasses = (status: string) => statusClasses[status] ?? 'bg-gray-100 text-gray-800';

const {
  handleActiveTabChange,
  handleExportConfigUpdate,
  handleValidateExport,
  handlePreviewExport,
  handleStartExport,
  handleQuickExportAll,
  handleImportConfigUpdate,
  handleImportFilesAdded,
  handleImportFileRemoved,
  handleAnalyzeFiles,
  handleValidateImport,
  handleStartImport,
  handleCreateFullBackup,
  handleCreateQuickBackup,
  handleScheduleBackup,
  handleDownloadBackup,
  handleRestoreBackup,
  handleDeleteBackup,
  handleMigrationConfigUpdate,
  handleStartVersionMigration,
  handleStartPlatformMigration,
  handleViewHistory,
  handleCancelOperation
} = useImportExportActions({
  exportWorkflow,
  importWorkflow,
  backupWorkflow,
  migrationWorkflow,
  activeTab,
  currentOperation,
  endProgress: end,
  notify: notifyWithToast
});

onMounted(async () => {
  await Promise.all([initializeExport(), initializeBackup()]);
  isInitialized.value = true;
  emit('initialized');
});
</script>
