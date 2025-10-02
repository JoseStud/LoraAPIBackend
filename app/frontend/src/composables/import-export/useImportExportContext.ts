import { provide, inject, ref, type Ref } from 'vue';

import type { ActiveTab } from '@/features/import-export/public';

import { useBackupWorkflow } from './useBackupWorkflow';
import { useExportWorkflow, type NotifyType } from './useExportWorkflow';
import { useImportExportActions } from './useImportExportActions';
import { useImportWorkflow } from './useImportWorkflow';
import { useMigrationWorkflow } from './useMigrationWorkflow';
import { useOperationProgress, type OperationType, type ProgressMessage } from './useOperationProgress';
import { useWorkflowToast } from './useWorkflowToast';

import { formatDateTime, formatFileSize as formatBytes } from '@/utils/format';
import type { ExportConfig, ImportConfig } from '@/types';
import type { MigrationConfig } from './useMigrationWorkflow';

const IMPORT_EXPORT_CONTEXT_SYMBOL = Symbol('ImportExportContext');

const STATUS_CLASSES: Record<string, string> = {
  new: 'bg-green-100 text-green-800',
  conflict: 'bg-yellow-100 text-yellow-800',
  existing: 'bg-gray-100 text-gray-800',
  error: 'bg-red-100 text-red-800'
};

export interface ImportExportContext {
  isInitialized: Ref<boolean>;
  activeTab: Ref<ActiveTab>;
  toast: {
    show: Ref<boolean>;
    message: Ref<string>;
    type: Ref<NotifyType>;
    notify: (message: string, type?: NotifyType) => void;
  };
  progress: {
    show: Ref<boolean>;
    title: Ref<string>;
    value: Ref<number>;
    currentStep: Ref<string>;
    messages: Ref<ProgressMessage[]>;
    currentOperation: Ref<OperationType | null>;
  };
  exportWorkflow: ReturnType<typeof useExportWorkflow>;
  importWorkflow: ReturnType<typeof useImportWorkflow>;
  backupWorkflow: ReturnType<typeof useBackupWorkflow>;
  migrationWorkflow: ReturnType<typeof useMigrationWorkflow>;
  formatFileSize: (bytes: number) => string;
  formatDate: (input: string) => string;
  getStatusClasses: (status: string) => string;
  actions: {
    setActiveTab: (value: ActiveTab) => void;
    quickExportAll: () => void;
    viewHistory: () => void;
    updateExportConfig: <K extends keyof ExportConfig>(key: K, value: ExportConfig[K]) => void;
    validateExport: () => void;
    previewExport: () => void;
    startExport: () => void;
    updateImportConfig: <K extends keyof ImportConfig>(key: K, value: ImportConfig[K]) => void;
    addImportFiles: (files: readonly File[]) => void;
    removeImportFile: (file: File) => void;
    analyzeFiles: () => void;
    validateImport: () => void;
    startImport: () => void;
    createFullBackup: () => void;
    createQuickBackup: () => void;
    scheduleBackup: ReturnType<typeof useBackupWorkflow>['scheduleBackup'];
    downloadBackup: ReturnType<typeof useBackupWorkflow>['downloadBackup'];
    restoreBackup: ReturnType<typeof useBackupWorkflow>['restoreBackup'];
    deleteBackup: ReturnType<typeof useBackupWorkflow>['deleteBackup'];
    updateMigrationConfig: <K extends keyof MigrationConfig>(key: K, value: MigrationConfig[K]) => void;
    startVersionMigration: () => void;
    startPlatformMigration: () => void;
    cancelOperation: () => void;
  };
  initialize: () => Promise<void>;
}

export function provideImportExportContext(): ImportExportContext {
  const initializedRef = ref(false);
  const activeTabRef = ref<ActiveTab>('export');

  const isInitialized = initializedRef;
  const activeTab = activeTabRef;

  const toast = useWorkflowToast();
  const progress = useOperationProgress();

  const exportWorkflow = useExportWorkflow({
    notify: toast.notify,
    progress: { begin: () => progress.begin('export'), update: progress.update, end: progress.end }
  });

  const importWorkflow = useImportWorkflow({
    notify: toast.notify,
    progress: { begin: () => progress.begin('import'), update: progress.update, end: progress.end }
  });

  const backupWorkflow = useBackupWorkflow({ notify: toast.notify });
  const migrationWorkflow = useMigrationWorkflow({ notify: toast.notify });

  const actionsSource = useImportExportActions({
    exportWorkflow,
    importWorkflow,
    backupWorkflow,
    migrationWorkflow,
    activeTab,
    currentOperation: progress.currentOperation,
    endProgress: progress.end,
    notify: toast.notify
  });

  const formatFileSize = (bytes: number) => formatBytes(typeof bytes === 'number' ? bytes : 0);
  const formatDate = (date: string) =>
    formatDateTime(date, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

  const getStatusClasses = (status: string) => STATUS_CLASSES[status] ?? 'bg-gray-100 text-gray-800';

  const initialize = async () => {
    await Promise.all([exportWorkflow.initialize(), backupWorkflow.initialize()]);
    initializedRef.value = true;
  };

  const context: ImportExportContext = {
    isInitialized,
    activeTab,
    toast: {
      show: toast.showToast,
      message: toast.toastMessage,
      type: toast.toastType,
      notify: toast.notify
    },
    progress: {
      show: progress.showProgress,
      title: progress.progressTitle,
      value: progress.progressValue,
      currentStep: progress.currentStep,
      messages: progress.progressMessages,
      currentOperation: progress.currentOperation
    },
    exportWorkflow,
    importWorkflow,
    backupWorkflow,
    migrationWorkflow,
    formatFileSize,
    formatDate,
    getStatusClasses,
    actions: {
      setActiveTab: actionsSource.handleActiveTabChange,
      quickExportAll: actionsSource.handleQuickExportAll,
      viewHistory: actionsSource.handleViewHistory,
      updateExportConfig: actionsSource.handleExportConfigUpdate,
      validateExport: actionsSource.handleValidateExport,
      previewExport: actionsSource.handlePreviewExport,
      startExport: actionsSource.handleStartExport,
      updateImportConfig: actionsSource.handleImportConfigUpdate,
      addImportFiles: actionsSource.handleImportFilesAdded,
      removeImportFile: actionsSource.handleImportFileRemoved,
      analyzeFiles: actionsSource.handleAnalyzeFiles,
      validateImport: actionsSource.handleValidateImport,
      startImport: actionsSource.handleStartImport,
      createFullBackup: actionsSource.handleCreateFullBackup,
      createQuickBackup: actionsSource.handleCreateQuickBackup,
      scheduleBackup: actionsSource.handleScheduleBackup,
      downloadBackup: actionsSource.handleDownloadBackup,
      restoreBackup: actionsSource.handleRestoreBackup,
      deleteBackup: actionsSource.handleDeleteBackup,
      updateMigrationConfig: actionsSource.handleMigrationConfigUpdate,
      startVersionMigration: actionsSource.handleStartVersionMigration,
      startPlatformMigration: actionsSource.handleStartPlatformMigration,
      cancelOperation: actionsSource.handleCancelOperation
    },
    initialize
  };

  provide(IMPORT_EXPORT_CONTEXT_SYMBOL, context);

  return context;
}

export function useImportExportContext(): ImportExportContext {
  const context = inject<ImportExportContext | undefined>(IMPORT_EXPORT_CONTEXT_SYMBOL);
  if (!context) {
    throw new Error('useImportExportContext must be used within an ImportExportProvider');
  }
  return context;
}

