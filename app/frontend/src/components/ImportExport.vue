<template>
  <div class="import-export-container" v-if="isInitialized">
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">Import/Export</h1>
          <p class="page-subtitle">Manage data migration, backups, and bulk operations</p>
        </div>
        <div class="header-actions">
          <div class="flex items-center space-x-3">
            <button @click="onQuickExportAll" class="btn btn-primary btn-sm">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Quick Export All
            </button>

            <button @click="viewHistory" class="btn btn-secondary btn-sm">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              View History
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="border-b border-gray-200">
          <nav class="-mb-px flex space-x-8">
            <button
              @click="activeTab = 'export'"
              :class="activeTab === 'export' ? 'tab-button active' : 'tab-button'"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Export Data
            </button>

            <button
              @click="activeTab = 'import'"
              :class="activeTab === 'import' ? 'tab-button active' : 'tab-button'"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
              </svg>
              Import Data
            </button>

            <button
              @click="activeTab = 'backup'"
              :class="activeTab === 'backup' ? 'tab-button active' : 'tab-button'"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"></path>
              </svg>
              Backup/Restore
            </button>

            <button
              @click="activeTab = 'migration'"
              :class="activeTab === 'migration' ? 'tab-button active' : 'tab-button'"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path>
              </svg>
              Data Migration
            </button>
          </nav>
        </div>
      </div>

      <div class="card-body">
        <ExportConfigurationPanel
          v-show="activeTab === 'export'"
          :config="exportConfig"
          :can-export="canExport"
          :estimated-size="estimatedSize"
          :estimated-time="estimatedTime"
          :is-exporting="isExporting"
          @update-config="onExportConfigUpdate"
          @validate="validateExport"
          @preview="previewExport"
          @start="() => startExport()"
        />

        <ImportProcessingPanel
          v-show="activeTab === 'import'"
          :config="importConfig"
          :files="importFiles"
          :preview="importPreview"
          :has-encrypted-files="hasEncryptedFiles"
          :is-importing="isImporting"
          :format-file-size="formatFileSize"
          :get-status-classes="getStatusClasses"
          @update-config="onImportConfigUpdate"
          @add-files="onImportFilesAdded"
          @remove-file="onImportFileRemoved"
          @analyze="() => analyzeFiles()"
          @validate="validateImport"
          @start="() => startImport()"
        />

        <BackupManagementPanel
          v-show="activeTab === 'backup'"
          :history="backupHistory"
          :format-file-size="formatFileSize"
          :format-date="formatDate"
          @create-full-backup="() => createFullBackup()"
          @create-quick-backup="() => createQuickBackup()"
          @schedule-backup="scheduleBackup"
          @download-backup="downloadBackup"
          @restore-backup="restoreBackup"
          @delete-backup="deleteBackup"
        />

        <MigrationWorkflowPanel
          v-show="activeTab === 'migration'"
          :config="migrationConfig"
          @update-config="onMigrationConfigUpdate"
          @start-version-migration="startVersionMigration"
          @start-platform-migration="startPlatformMigration"
        />
      </div>
    </div>

    <div
      v-show="showProgress"
      class="fixed inset-0 z-50 overflow-y-auto transition-opacity duration-300"
      :class="showProgress ? 'opacity-100' : 'opacity-0'"
      role="dialog"
      aria-modal="true"
      :aria-busy="showProgress"
      aria-labelledby="progress-title"
    >
      <div class="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75"></div>

        <div class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div class="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <h3 id="progress-title" class="text-lg leading-6 font-medium text-gray-900 mb-4">{{ progressTitle }}</h3>

            <div class="space-y-4">
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span>{{ currentStep }}</span>
                  <span>{{ progressValue }}%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                  <div
                    class="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    :style="`width: ${progressValue}%`"
                  ></div>
                </div>
              </div>

              <div class="max-h-40 overflow-y-auto text-xs font-mono bg-gray-100 p-3 rounded">
                <div v-for="message in progressMessages" :key="message.id">
                  {{ message.text }}
                </div>
              </div>
            </div>
          </div>
          <div class="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              @click="cancelOperation"
              type="button"
              class="w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <div
      v-show="showToast"
      class="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg transition-all duration-300"
      :class="toastClasses"
    >
      {{ toastMessage }}
    </div>
  </div>

  <div v-else class="py-12 text-center text-gray-500">
    <svg class="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25"></circle>
      <path d="M4 12a8 8 0 018-8" stroke-width="4" class="opacity-75"></path>
    </svg>
    Loading import/export workflows...
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import BackupManagementPanel from './import-export/BackupManagementPanel.vue';
import ExportConfigurationPanel from './import-export/ExportConfigurationPanel.vue';
import ImportProcessingPanel from './import-export/ImportProcessingPanel.vue';
import MigrationWorkflowPanel from './import-export/MigrationWorkflowPanel.vue';

import { useBackupWorkflow } from '@/composables/useBackupWorkflow';
import { useExportWorkflow, type ExportConfig, type ProgressUpdate } from '@/composables/useExportWorkflow';
import { useImportWorkflow, type ImportConfig } from '@/composables/useImportWorkflow';
import { useMigrationWorkflow, type MigrationConfig } from '@/composables/useMigrationWorkflow';
import { formatDateTime, formatFileSize as formatBytes } from '@/utils/format';

type OperationType = 'export' | 'import' | 'migration';

type ExportConfigUpdate = {
  key: keyof ExportConfig;
  value: ExportConfig[keyof ExportConfig];
};

type ImportConfigUpdate = {
  key: keyof ImportConfig;
  value: ImportConfig[keyof ImportConfig];
};

type MigrationConfigUpdate = {
  key: keyof MigrationConfig;
  value: MigrationConfig[keyof MigrationConfig];
};

const isInitialized = ref(false);
const activeTab = ref<'export' | 'import' | 'backup' | 'migration'>('export');

const showProgress = ref(false);
const progressValue = ref(0);
const currentStep = ref('');
const progressMessages = ref<Array<{ id: number; text: string }>>([]);
const currentOperation = ref<OperationType | null>(null);

const showToast = ref(false);
const toastMessage = ref('');
const toastType = ref<'success' | 'error' | 'warning' | 'info'>('info');
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

const toastClasses = computed(() => {
  const baseClasses = 'px-4 py-2 rounded-lg shadow-lg';
  switch (toastType.value) {
    case 'success':
      return `${baseClasses} bg-green-500 text-white`;
    case 'error':
      return `${baseClasses} bg-red-500 text-white`;
    case 'warning':
      return `${baseClasses} bg-yellow-500 text-white`;
    default:
      return `${baseClasses} bg-blue-500 text-white`;
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
const formatDate = (dateString: string) => formatDateTime(dateString, {
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

const onExportConfigUpdate = (payload: ExportConfigUpdate) => {
  exportWorkflow.updateConfig(payload.key, payload.value);
};

const onImportConfigUpdate = (payload: ImportConfigUpdate) => {
  importWorkflow.updateConfig(payload.key, payload.value);
};

const onMigrationConfigUpdate = (payload: MigrationConfigUpdate) => {
  migrationWorkflow.updateConfig(payload.key, payload.value);
};

const onImportFilesAdded = (files: readonly File[]) => {
  importWorkflow.addFiles([...files]);
};

const onImportFileRemoved = (file: File) => {
  importWorkflow.removeFile(file);
};

const startExport = () => {
  void exportWorkflow.startExport();
};

const startImport = () => {
  void importWorkflow.startImport();
};

const analyzeFiles = () => {
  void importWorkflow.analyzeFiles();
};

const validateExport = () => exportWorkflow.validateExport();
const previewExport = () => exportWorkflow.previewExport();
const validateImport = () => importWorkflow.validateImport();
const createFullBackup = () => backupWorkflow.createFullBackup();
const createQuickBackup = () => backupWorkflow.createQuickBackup();
const scheduleBackup = () => backupWorkflow.scheduleBackup();
const downloadBackup = (backupId: string) => backupWorkflow.downloadBackup(backupId);
const restoreBackup = (backupId: string) => backupWorkflow.restoreBackup(backupId);
const deleteBackup = (backupId: string) => backupWorkflow.deleteBackup(backupId);
const startVersionMigration = () => migrationWorkflow.startVersionMigration();
const startPlatformMigration = () => migrationWorkflow.startPlatformMigration();

const onQuickExportAll = () => {
  void exportWorkflow.quickExportAll();
};

const viewHistory = () => {
  activeTab.value = 'backup';
};

const cancelOperation = () => {
  if (currentOperation.value === 'export') {
    exportWorkflow.cancelExport();
  } else if (currentOperation.value === 'import') {
    importWorkflow.cancelImport();
  }
  endProgress();
  notify('Operation cancelled', 'warning');
};

onMounted(async () => {
  await Promise.all([
    exportWorkflow.initialize(),
    backupWorkflow.initialize()
  ]);
  isInitialized.value = true;
});
</script>
