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
            <button @click="quickExportAll" class="btn btn-primary btn-sm">
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
            <button @click="setActiveTab('export')" :class="activeTab === 'export' ? 'tab-button active' : 'tab-button'">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-4-4m4 4l4-4m6-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              Export Data
            </button>

            <button @click="setActiveTab('import')" :class="activeTab === 'import' ? 'tab-button active' : 'tab-button'">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"></path>
              </svg>
              Import Data
            </button>

            <button @click="setActiveTab('backup')" :class="activeTab === 'backup' ? 'tab-button active' : 'tab-button'">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"></path>
              </svg>
              Backup/Restore
            </button>

            <button @click="setActiveTab('migration')" :class="activeTab === 'migration' ? 'tab-button active' : 'tab-button'">
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l4-4 4 4m0 6l-4 4-4-4"></path>
              </svg>
              Data Migration
            </button>
          </nav>
        </div>
      </div>

      <div class="card-body">
        <ExportConfigurationPanel v-show="activeTab === 'export'" />

        <ImportProcessingPanel v-show="activeTab === 'import'" />

        <BackupManagementPanel v-show="activeTab === 'backup'" />

        <MigrationWorkflowPanel v-show="activeTab === 'migration'" />
      </div>
    </div>

    <ImportExportProgressModal />

    <ImportExportToast />
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
import BackupManagementPanel from './BackupManagementPanel.vue';
import ExportConfigurationPanel from './ExportConfigurationPanel.vue';
import ImportProcessingPanel from './ImportProcessingPanel.vue';
import MigrationWorkflowPanel from './MigrationWorkflowPanel.vue';
import ImportExportProgressModal from './ImportExportProgressModal.vue';
import ImportExportToast from './ImportExportToast.vue';

export type ActiveTab = 'export' | 'import' | 'backup' | 'migration';

import { useImportExportContext } from '@/composables/import-export';

const {
  isInitialized,
  activeTab,
  actions: {
    setActiveTab,
    quickExportAll,
    viewHistory
  }
} = useImportExportContext();
</script>
