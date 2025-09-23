<template>
  <div v-if="isInitialized" class="import-export-container">
    <div class="page-header">
      <div class="flex justify-between items-center">
        <div>
          <h1 class="page-title">Import/Export</h1>
          <p class="page-subtitle">Manage data migration, backups, and bulk operations</p>
        </div>
        <div class="header-actions">
          <div class="flex items-center space-x-3">
            <button @click="$emit('quickExportAll')" class="btn btn-primary btn-sm">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Quick Export All
            </button>

            <button @click="$emit('viewHistory')" class="btn btn-secondary btn-sm">
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
              @click="onTabChange('export')"
              :class="activeTab === 'export' ? 'tab-button active' : 'tab-button'"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Export Data
            </button>

            <button
              @click="onTabChange('import')"
              :class="activeTab === 'import' ? 'tab-button active' : 'tab-button'"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
              </svg>
              Import Data
            </button>

            <button
              @click="onTabChange('backup')"
              :class="activeTab === 'backup' ? 'tab-button active' : 'tab-button'"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"></path>
              </svg>
              Backup/Restore
            </button>

            <button
              @click="onTabChange('migration')"
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
          @validate="$emit('validateExport')"
          @preview="$emit('previewExport')"
          @start="$emit('startExport')"
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
          @add-files="$emit('addImportFiles', $event)"
          @remove-file="$emit('removeImportFile', $event)"
          @analyze="$emit('analyzeFiles')"
          @validate="$emit('validateImport')"
          @start="$emit('startImport')"
        />

        <BackupManagementPanel
          v-show="activeTab === 'backup'"
          :history="backupHistory"
          :format-file-size="formatFileSize"
          :format-date="formatDate"
          @create-full-backup="$emit('createFullBackup')"
          @create-quick-backup="$emit('createQuickBackup')"
          @schedule-backup="$emit('scheduleBackup')"
          @download-backup="$emit('downloadBackup', $event)"
          @restore-backup="$emit('restoreBackup', $event)"
          @delete-backup="$emit('deleteBackup', $event)"
        />

        <MigrationWorkflowPanel
          v-show="activeTab === 'migration'"
          :config="migrationConfig"
          @update-config="onMigrationConfigUpdate"
          @start-version-migration="$emit('startVersionMigration')"
          @start-platform-migration="$emit('startPlatformMigration')"
        />
      </div>
    </div>

    <ImportExportProgressModal
      :show="showProgress"
      :title="progressTitle"
      :value="progressValue"
      :current-step="currentStep"
      :messages="progressMessages"
      @cancel="$emit('cancelOperation')"
    />

    <ImportExportToast :show="showToast" :message="toastMessage" :type="toastType" />
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
import BackupManagementPanel from './import-export/BackupManagementPanel.vue';
import ExportConfigurationPanel from './import-export/ExportConfigurationPanel.vue';
import ImportProcessingPanel from './import-export/ImportProcessingPanel.vue';
import MigrationWorkflowPanel from './import-export/MigrationWorkflowPanel.vue';
import ImportExportProgressModal from './import-export/ImportExportProgressModal.vue';
import ImportExportToast from './import-export/ImportExportToast.vue';

import type { NotifyType, ExportConfig } from '@/composables/useExportWorkflow';
import type { ImportConfig, ImportPreviewItem } from '@/composables/useImportWorkflow';
import type { MigrationConfig } from '@/composables/useMigrationWorkflow';
import type { BackupEntry } from '@/composables/useBackupWorkflow';

export type ActiveTab = 'export' | 'import' | 'backup' | 'migration';

interface ProgressMessage {
  id: number | string;
  text: string;
}

defineProps<{
  isInitialized: boolean;
  activeTab: ActiveTab;
  exportConfig: ExportConfig;
  canExport: boolean;
  estimatedSize: string;
  estimatedTime: string;
  isExporting: boolean;
  importConfig: ImportConfig;
  importFiles: readonly File[];
  importPreview: readonly ImportPreviewItem[];
  hasEncryptedFiles: boolean;
  isImporting: boolean;
  backupHistory: readonly BackupEntry[];
  migrationConfig: MigrationConfig;
  showProgress: boolean;
  progressTitle: string;
  progressValue: number;
  currentStep: string;
  progressMessages: readonly ProgressMessage[];
  showToast: boolean;
  toastMessage: string;
  toastType: NotifyType;
  formatFileSize: (bytes: number) => string;
  formatDate: (input: string) => string;
  getStatusClasses: (status: string) => string;
}>();

const emit = defineEmits<{
  (e: 'update:activeTab', value: ActiveTab): void;
  (e: 'quickExportAll'): void;
  (e: 'viewHistory'): void;
  <K extends keyof ExportConfig>(e: 'updateExportConfig', key: K, value: ExportConfig[K]): void;
  (e: 'validateExport'): void;
  (e: 'previewExport'): void;
  (e: 'startExport'): void;
  <K extends keyof ImportConfig>(e: 'updateImportConfig', key: K, value: ImportConfig[K]): void;
  (e: 'addImportFiles', files: readonly File[]): void;
  (e: 'removeImportFile', file: File): void;
  (e: 'analyzeFiles'): void;
  (e: 'validateImport'): void;
  (e: 'startImport'): void;
  (e: 'createFullBackup'): void;
  (e: 'createQuickBackup'): void;
  (e: 'scheduleBackup'): void;
  (e: 'downloadBackup', backupId: string): void;
  (e: 'restoreBackup', backupId: string): void;
  (e: 'deleteBackup', backupId: string): void;
  <K extends keyof MigrationConfig>(e: 'updateMigrationConfig', key: K, value: MigrationConfig[K]): void;
  (e: 'startVersionMigration'): void;
  (e: 'startPlatformMigration'): void;
  (e: 'cancelOperation'): void;
}>();

const onTabChange = (tab: ActiveTab) => {
  emit('update:activeTab', tab);
};

const onExportConfigUpdate = <K extends keyof ExportConfig>(key: K, value: ExportConfig[K]) => {
  emit('updateExportConfig', key, value);
};

const onImportConfigUpdate = <K extends keyof ImportConfig>(key: K, value: ImportConfig[K]) => {
  emit('updateImportConfig', key, value);
};

const onMigrationConfigUpdate = <K extends keyof MigrationConfig>(key: K, value: MigrationConfig[K]) => {
  emit('updateMigrationConfig', key, value);
};
</script>
