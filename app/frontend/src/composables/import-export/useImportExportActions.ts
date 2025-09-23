import type { Ref } from 'vue';

import type { ActiveTab } from '@/components/ImportExport.vue';
import type { NotifyType, UseExportWorkflow } from './useExportWorkflow';
import type { UseImportWorkflow } from './useImportWorkflow';
import type { UseBackupWorkflow } from './useBackupWorkflow';
import type { UseMigrationWorkflow } from './useMigrationWorkflow';
import type { OperationType } from './useOperationProgress';

interface UseImportExportActionsOptions {
  exportWorkflow: UseExportWorkflow;
  importWorkflow: UseImportWorkflow;
  backupWorkflow: UseBackupWorkflow;
  migrationWorkflow: UseMigrationWorkflow;
  activeTab: Ref<ActiveTab>;
  currentOperation: Ref<OperationType | null>;
  endProgress: () => void;
  notify: (message: string, type?: NotifyType) => void;
}

export function useImportExportActions(options: UseImportExportActionsOptions) {
  const {
    exportWorkflow,
    importWorkflow,
    backupWorkflow,
    migrationWorkflow,
    activeTab,
    currentOperation,
    endProgress,
    notify
  } = options;

  const handleActiveTabChange = (value: ActiveTab) => {
    activeTab.value = value;
  };

  const handleExportConfigUpdate = exportWorkflow.updateConfig;
  const handleValidateExport = exportWorkflow.validateExport;
  const handlePreviewExport = exportWorkflow.previewExport;
  const handleStartExport = () => {
    void exportWorkflow.startExport();
  };
  const handleQuickExportAll = () => {
    void exportWorkflow.quickExportAll();
  };

  const handleImportConfigUpdate = importWorkflow.updateConfig;
  const handleImportFilesAdded = (files: readonly File[]) => {
    importWorkflow.addFiles([...files]);
  };
  const handleImportFileRemoved = (file: File) => {
    importWorkflow.removeFile(file);
  };
  const handleAnalyzeFiles = () => {
    void importWorkflow.analyzeFiles();
  };
  const handleValidateImport = importWorkflow.validateImport;
  const handleStartImport = () => {
    void importWorkflow.startImport();
  };

  const handleCreateFullBackup = () => {
    void backupWorkflow.createFullBackup();
  };
  const handleCreateQuickBackup = () => {
    void backupWorkflow.createQuickBackup();
  };
  const handleScheduleBackup = backupWorkflow.scheduleBackup;
  const handleDownloadBackup = backupWorkflow.downloadBackup;
  const handleRestoreBackup = backupWorkflow.restoreBackup;
  const handleDeleteBackup = backupWorkflow.deleteBackup;

  const handleMigrationConfigUpdate = migrationWorkflow.updateConfig;
  const handleStartVersionMigration = migrationWorkflow.startVersionMigration;
  const handleStartPlatformMigration = migrationWorkflow.startPlatformMigration;

  const handleViewHistory = () => {
    activeTab.value = 'backup';
  };

  const cancelHandlers: Partial<Record<OperationType, () => void>> = {
    export: () => exportWorkflow.cancelExport(),
    import: () => importWorkflow.cancelImport()
  };

  const handleCancelOperation = () => {
    const operation = currentOperation.value;
    if (operation && cancelHandlers[operation]) {
      cancelHandlers[operation]?.();
    }
    endProgress();
    notify('Operation cancelled', 'warning');
  };

  return {
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
  };
}
