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
    @update:active-tab="value => (activeTab.value = value)"
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import ImportExport, { type ActiveTab } from '../ImportExport.vue';

import { useBackupWorkflow } from '@/composables/useBackupWorkflow';
import {
  useExportWorkflow,
  type ExportConfig,
  type NotifyType,
  type ProgressUpdate
} from '@/composables/useExportWorkflow';
import { useImportWorkflow, type ImportConfig } from '@/composables/useImportWorkflow';
import { useMigrationWorkflow, type MigrationConfig } from '@/composables/useMigrationWorkflow';
import { formatDateTime, formatFileSize as formatBytes } from '@/utils/format';

type OperationType = 'export' | 'import' | 'migration';

type ProgressMessage = { id: number | string; text: string };

const isInitialized = ref(false);
const activeTab = ref<ActiveTab>('export');

const showProgress = ref(false);
const progressValue = ref(0);
const currentStep = ref('');
const progressMessages = ref<ProgressMessage[]>([]);
const currentOperation = ref<OperationType | null>(null);

const showToast = ref(false);
const toastMessage = ref('');
const toastType = ref<NotifyType>('info');
let toastTimeout: ReturnType<typeof setTimeout> | undefined;

const progressTitle = computed(() => {
  switch (currentOperation.value) {
    case 'export':
      return 'Export Progress';
    case 'import':
      return 'Import Progress';
    case 'migration':
      return 'Migration Progress';
    default:
      return 'Progress';
  }
});

const notify: Parameters<typeof useExportWorkflow>[0]['notify'] = (message, type = 'info') => {
  toastMessage.value = message;
  toastType.value = type;
  showToast.value = true;
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  toastTimeout = setTimeout(() => {
    showToast.value = false;
  }, 3000);
};

const resetProgress = () => {
  progressValue.value = 0;
  currentStep.value = '';
  progressMessages.value = [];
};

const beginProgress = (operation: OperationType) => {
  currentOperation.value = operation;
  resetProgress();
  showProgress.value = true;
};

const updateProgress = (update: ProgressUpdate) => {
  if (typeof update.value === 'number') {
    progressValue.value = update.value;
  }
  if (typeof update.step === 'string') {
    currentStep.value = update.step;
  }
  if (update.message) {
    progressMessages.value = [
      ...progressMessages.value,
      {
        id: Date.now() + Math.random(),
        text: `[${new Date().toLocaleTimeString()}] ${update.message}`
      }
    ];
  }
};

const endProgress = () => {
  showProgress.value = false;
  currentOperation.value = null;
};

const exportWorkflow = useExportWorkflow({
  notify,
  progress: {
    begin: () => beginProgress('export'),
    update: updateProgress,
    end: endProgress
  }
});

const importWorkflow = useImportWorkflow({
  notify,
  progress: {
    begin: () => beginProgress('import'),
    update: updateProgress,
    end: endProgress
  }
});

const backupWorkflow = useBackupWorkflow({ notify });
const migrationWorkflow = useMigrationWorkflow({ notify });

const exportConfig = exportWorkflow.exportConfig;
const canExport = exportWorkflow.canExport;
const estimatedSize = exportWorkflow.estimatedSize;
const estimatedTime = exportWorkflow.estimatedTime;
const isExporting = exportWorkflow.isExporting;

const importConfig = importWorkflow.importConfig;
const importFiles = importWorkflow.importFiles;
const importPreview = importWorkflow.importPreview;
const hasEncryptedFiles = importWorkflow.hasEncryptedFiles;
const isImporting = importWorkflow.isImporting;

const backupHistory = backupWorkflow.backupHistory;
const migrationConfig = migrationWorkflow.migrationConfig;

const formatFileSize = (bytes: number) => formatBytes(typeof bytes === 'number' ? bytes : 0);
const formatDate = (dateString: string) =>
  formatDateTime(dateString, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

const getStatusClasses = (status: string) => {
  const statusClasses: Record<string, string> = {
    new: 'bg-green-100 text-green-800',
    conflict: 'bg-yellow-100 text-yellow-800',
    existing: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800'
  };
  return statusClasses[status] ?? 'bg-gray-100 text-gray-800';
};

const handleExportConfigUpdate = <K extends keyof ExportConfig>(key: K, value: ExportConfig[K]) => {
  exportWorkflow.updateConfig(key, value);
};

const handleImportConfigUpdate = <K extends keyof ImportConfig>(key: K, value: ImportConfig[K]) => {
  importWorkflow.updateConfig(key, value);
};

const handleMigrationConfigUpdate = <K extends keyof MigrationConfig>(key: K, value: MigrationConfig[K]) => {
  migrationWorkflow.updateConfig(key, value);
};

const handleImportFilesAdded = (files: readonly File[]) => {
  importWorkflow.addFiles([...files]);
};

const handleImportFileRemoved = (file: File) => {
  importWorkflow.removeFile(file);
};

const handleStartExport = () => {
  void exportWorkflow.startExport();
};

const handleStartImport = () => {
  void importWorkflow.startImport();
};

const handleAnalyzeFiles = () => {
  void importWorkflow.analyzeFiles();
};

const handleValidateExport = () => {
  exportWorkflow.validateExport();
};

const handlePreviewExport = () => {
  exportWorkflow.previewExport();
};

const handleValidateImport = () => {
  importWorkflow.validateImport();
};

const handleCreateFullBackup = () => {
  void backupWorkflow.createFullBackup();
};

const handleCreateQuickBackup = () => {
  void backupWorkflow.createQuickBackup();
};

const handleScheduleBackup = () => {
  backupWorkflow.scheduleBackup();
};

const handleDownloadBackup = (backupId: string) => {
  backupWorkflow.downloadBackup(backupId);
};

const handleRestoreBackup = (backupId: string) => {
  backupWorkflow.restoreBackup(backupId);
};

const handleDeleteBackup = (backupId: string) => {
  backupWorkflow.deleteBackup(backupId);
};

const handleStartVersionMigration = () => {
  migrationWorkflow.startVersionMigration();
};

const handleStartPlatformMigration = () => {
  migrationWorkflow.startPlatformMigration();
};

const handleQuickExportAll = () => {
  void exportWorkflow.quickExportAll();
};

const handleViewHistory = () => {
  activeTab.value = 'backup';
};

const handleCancelOperation = () => {
  if (currentOperation.value === 'export') {
    exportWorkflow.cancelExport();
  } else if (currentOperation.value === 'import') {
    importWorkflow.cancelImport();
  }
  endProgress();
  notify('Operation cancelled', 'warning');
};

onMounted(async () => {
  await Promise.all([exportWorkflow.initialize(), backupWorkflow.initialize()]);
  isInitialized.value = true;
});

onBeforeUnmount(() => {
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
});
</script>
