import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, reactive, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';

import ImportExportContainer from '../../app/frontend/src/components/import-export/ImportExportContainer.vue';

function stubComponent(name, emits = []) {
  return defineComponent({
    name,
    emits,
    setup(_, { slots }) {
      return () => h('div', { class: name }, slots.default ? slots.default() : name);
    }
  });
}

const exportProgressHandlers = [];

const mockExportWorkflow = {
  exportConfig: reactive({}),
  canExport: ref(true),
  estimatedSize: ref('10 MB'),
  estimatedTime: ref('5 minutes'),
  isExporting: ref(false),
  initialize: vi.fn().mockResolvedValue(undefined),
  updateConfig: vi.fn(),
  validateExport: vi.fn(),
  previewExport: vi.fn(),
  startExport: vi.fn(),
  quickExportAll: vi.fn(),
  cancelExport: vi.fn()
};

const mockImportWorkflow = {
  importConfig: reactive({}),
  importFiles: ref([]),
  importPreview: ref([]),
  hasEncryptedFiles: ref(false),
  isImporting: ref(false),
  updateConfig: vi.fn(),
  addFiles: vi.fn(),
  removeFile: vi.fn(),
  clearFiles: vi.fn(),
  analyzeFiles: vi.fn(),
  validateImport: vi.fn(),
  startImport: vi.fn(),
  cancelImport: vi.fn()
};

const mockBackupWorkflow = {
  backupHistory: ref([]),
  initialize: vi.fn().mockResolvedValue(undefined),
  createFullBackup: vi.fn(),
  createQuickBackup: vi.fn(),
  scheduleBackup: vi.fn(),
  downloadBackup: vi.fn(),
  restoreBackup: vi.fn(),
  deleteBackup: vi.fn()
};

const mockMigrationWorkflow = {
  migrationConfig: reactive({}),
  updateConfig: vi.fn(),
  startVersionMigration: vi.fn(),
  startPlatformMigration: vi.fn()
};

const importExportState = vi.hoisted(() => ({
  progress: null,
  toast: null,
}));

vi.mock('@/composables/import-export', async () => {
  const { ref } = await import('vue');

  const progressState = {
    showProgress: ref(false),
    progressTitle: ref(''),
    progressValue: ref(0),
    currentStep: ref(''),
    progressMessages: ref([]),
    currentOperation: ref(null),
  };

  const toastState = {
    showToast: ref(false),
    toastMessage: ref(''),
    toastType: ref('info'),
    notify: vi.fn(),
  };

  importExportState.progress = progressState;
  importExportState.toast = toastState;

  const begin = vi.fn((operation) => {
    progressState.currentOperation.value = operation;
    progressState.showProgress.value = true;
  });

  const update = vi.fn((updateState) => {
    if (typeof updateState.value === 'number') {
      progressState.progressValue.value = updateState.value;
    }
    if (typeof updateState.step === 'string') {
      progressState.currentStep.value = updateState.step;
    }
    if (typeof updateState.message === 'string') {
      progressState.progressMessages.value = [
        ...progressState.progressMessages.value,
        { id: progressState.progressMessages.value.length, text: updateState.message },
      ];
    }
  });

  const end = vi.fn(() => {
    progressState.showProgress.value = false;
    progressState.progressValue.value = 0;
    progressState.currentStep.value = '';
    progressState.progressMessages.value = [];
    progressState.currentOperation.value = null;
  });

  const buildActions = (
    exportWorkflow,
    importWorkflow,
    backupWorkflow,
    migrationWorkflow,
    activeTab,
    currentOperation,
    endProgress,
    notify,
  ) => ({
    handleActiveTabChange: (value) => {
      activeTab.value = value;
    },
    handleExportConfigUpdate: (key, value) => {
      exportWorkflow.updateConfig(key, value);
    },
    handleValidateExport: () => {
      exportWorkflow.validateExport();
    },
    handlePreviewExport: () => {
      exportWorkflow.previewExport();
    },
    handleStartExport: async () => {
      await exportWorkflow.startExport();
    },
    handleQuickExportAll: async () => {
      await exportWorkflow.quickExportAll();
    },
    handleImportConfigUpdate: (key, value) => {
      importWorkflow.updateConfig(key, value);
    },
    handleImportFilesAdded: (files) => {
      const items = Array.isArray(files) ? files : Array.from(files ?? []);
      importWorkflow.addFiles(items);
    },
    handleImportFileRemoved: (file) => {
      importWorkflow.removeFile(file);
    },
    handleAnalyzeFiles: async () => {
      await importWorkflow.analyzeFiles();
    },
    handleValidateImport: () => {
      importWorkflow.validateImport();
    },
    handleStartImport: async () => {
      await importWorkflow.startImport();
    },
    handleCreateFullBackup: async () => {
      await backupWorkflow.createFullBackup();
    },
    handleCreateQuickBackup: async () => {
      await backupWorkflow.createQuickBackup();
    },
    handleScheduleBackup: () => {
      backupWorkflow.scheduleBackup();
    },
    handleDownloadBackup: (id) => {
      backupWorkflow.downloadBackup(id);
    },
    handleRestoreBackup: (id) => {
      backupWorkflow.restoreBackup(id);
    },
    handleDeleteBackup: (id) => {
      backupWorkflow.deleteBackup(id);
    },
    handleMigrationConfigUpdate: (key, value) => {
      migrationWorkflow.updateConfig(key, value);
    },
    handleStartVersionMigration: () => {
      migrationWorkflow.startVersionMigration();
    },
    handleStartPlatformMigration: () => {
      migrationWorkflow.startPlatformMigration();
    },
    handleViewHistory: () => {
      activeTab.value = 'backup';
    },
    handleCancelOperation: () => {
      if (currentOperation.value === 'export') {
        exportWorkflow.cancelExport();
      } else if (currentOperation.value === 'import') {
        importWorkflow.cancelImport();
      }
      endProgress();
      notify('Operation cancelled', 'warning');
    },
  });

  return {
    useExportWorkflow: vi.fn((options) => {
      exportProgressHandlers.push(options.progress);
      return mockExportWorkflow;
    }),
    useImportWorkflow: vi.fn(() => mockImportWorkflow),
    useBackupWorkflow: vi.fn(() => mockBackupWorkflow),
    useMigrationWorkflow: vi.fn(() => mockMigrationWorkflow),
    useOperationProgress: vi.fn(() => ({
      showProgress: progressState.showProgress,
      progressTitle: progressState.progressTitle,
      progressValue: progressState.progressValue,
      currentStep: progressState.currentStep,
      progressMessages: progressState.progressMessages,
      currentOperation: progressState.currentOperation,
      begin,
      update,
      end,
    })),
    useImportExportActions: vi.fn((options) =>
      buildActions(
        options.exportWorkflow,
        options.importWorkflow,
        options.backupWorkflow,
        options.migrationWorkflow,
        options.activeTab,
        options.currentOperation,
        options.endProgress,
        options.notify,
      ),
    ),
    useWorkflowToast: vi.fn(() => toastState),
  };
});

vi.mock('@/components/import-export/ExportConfigurationPanel.vue', () => ({
  default: stubComponent('ExportConfigurationPanel', ['update-config', 'validate', 'preview', 'start'])
}));

vi.mock('@/components/import-export/ImportProcessingPanel.vue', () => ({
  default: stubComponent('ImportProcessingPanel', [
    'update-config',
    'add-files',
    'remove-file',
    'analyze',
    'validate',
    'start'
  ])
}));

vi.mock('@/components/import-export/BackupManagementPanel.vue', () => ({
  default: stubComponent('BackupManagementPanel', [
    'create-full-backup',
    'create-quick-backup',
    'schedule-backup',
    'download-backup',
    'restore-backup',
    'delete-backup'
  ])
}));

vi.mock('@/components/import-export/MigrationWorkflowPanel.vue', () => ({
  default: stubComponent('MigrationWorkflowPanel', [
    'update-config',
    'start-version-migration',
    'start-platform-migration'
  ])
}));

describe('ImportExportContainer.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    exportProgressHandlers.length = 0;
    Object.values({
      mockExportWorkflow,
      mockImportWorkflow,
      mockBackupWorkflow,
      mockMigrationWorkflow
    }).forEach((workflow) => {
      Object.values(workflow).forEach((value) => {
        if (typeof value === 'function') {
          value.mock?.clear?.();
        }
      });
    });

    const progressState = importExportState.progress;
    if (progressState) {
      progressState.showProgress.value = false;
      progressState.progressTitle.value = '';
      progressState.progressValue.value = 0;
      progressState.currentStep.value = '';
      progressState.progressMessages.value = [];
      progressState.currentOperation.value = null;
    }

    const toastState = importExportState.toast;
    if (toastState) {
      toastState.showToast.value = false;
      toastState.toastMessage.value = '';
      toastState.toastType.value = 'info';
      toastState.notify.mockClear();
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes workflows on mount', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();
    await vi.runAllTimersAsync();
    await flushPromises();

    expect(mockExportWorkflow.initialize).toHaveBeenCalled();
    expect(mockBackupWorkflow.initialize).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Import/Export');
  });

  it('emits an initialized event after setup completes', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();
    await vi.runAllTimersAsync();
    await flushPromises();

    expect(wrapper.emitted().initialized).toHaveLength(1);
  });

  it('invokes quick export workflow from header action', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();
    await vi.runAllTimersAsync();
    await flushPromises();

    await wrapper.find('button.btn-primary.btn-sm').trigger('click');
    expect(mockExportWorkflow.quickExportAll).toHaveBeenCalled();
  });

  it('routes history view to backup tab', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();
    await vi.runAllTimersAsync();
    await flushPromises();

    const historyButton = wrapper.findAll('button.btn-secondary.btn-sm').at(0);
    if (!historyButton) {
      throw new Error('History button not found');
    }
    await historyButton.trigger('click');

    expect(wrapper.html()).toContain('Backup/Restore');
  });

  it('forwards export panel actions to workflow', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();
    await vi.runAllTimersAsync();
    await flushPromises();

    const exportPanel = wrapper.findComponent({ name: 'ExportConfigurationPanel' });
    exportPanel.vm.$emit('update-config', 'loras', true);
    exportPanel.vm.$emit('validate');
    exportPanel.vm.$emit('preview');
    exportPanel.vm.$emit('start');

    expect(mockExportWorkflow.updateConfig).toHaveBeenCalledWith('loras', true);
    expect(mockExportWorkflow.validateExport).toHaveBeenCalled();
    expect(mockExportWorkflow.previewExport).toHaveBeenCalled();
    expect(mockExportWorkflow.startExport).toHaveBeenCalled();
  });

  it('forwards import panel events to workflow', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();
    await vi.runAllTimersAsync();
    await flushPromises();

    const importPanel = wrapper.findComponent({ name: 'ImportProcessingPanel' });
    const file = new File(['test'], 'test.zip');

    importPanel.vm.$emit('update-config', 'mode', 'replace');
    importPanel.vm.$emit('add-files', [file]);
    importPanel.vm.$emit('remove-file', file);
    importPanel.vm.$emit('analyze');
    importPanel.vm.$emit('validate');
    importPanel.vm.$emit('start');

    expect(mockImportWorkflow.updateConfig).toHaveBeenCalledWith('mode', 'replace');
    expect(mockImportWorkflow.addFiles).toHaveBeenCalled();
    expect(mockImportWorkflow.removeFile).toHaveBeenCalledWith(file);
    expect(mockImportWorkflow.analyzeFiles).toHaveBeenCalled();
    expect(mockImportWorkflow.validateImport).toHaveBeenCalled();
    expect(mockImportWorkflow.startImport).toHaveBeenCalled();
  });

  it('invokes backup workflow handlers', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();
    await vi.runAllTimersAsync();
    await flushPromises();

    const backupPanel = wrapper.findComponent({ name: 'BackupManagementPanel' });
    backupPanel.vm.$emit('create-full-backup');
    backupPanel.vm.$emit('create-quick-backup');
    backupPanel.vm.$emit('schedule-backup');
    backupPanel.vm.$emit('download-backup', 'backup-1');
    backupPanel.vm.$emit('restore-backup', 'backup-1');
    backupPanel.vm.$emit('delete-backup', 'backup-1');

    expect(mockBackupWorkflow.createFullBackup).toHaveBeenCalled();
    expect(mockBackupWorkflow.createQuickBackup).toHaveBeenCalled();
    expect(mockBackupWorkflow.scheduleBackup).toHaveBeenCalled();
    expect(mockBackupWorkflow.downloadBackup).toHaveBeenCalledWith('backup-1');
    expect(mockBackupWorkflow.restoreBackup).toHaveBeenCalledWith('backup-1');
    expect(mockBackupWorkflow.deleteBackup).toHaveBeenCalledWith('backup-1');
  });

  it('invokes migration workflow handlers', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();
    await vi.runAllTimersAsync();
    await flushPromises();

    const migrationPanel = wrapper.findComponent({ name: 'MigrationWorkflowPanel' });
    migrationPanel.vm.$emit('update-config', 'from_version', '1.0');
    migrationPanel.vm.$emit('start-version-migration');
    migrationPanel.vm.$emit('start-platform-migration');

    expect(mockMigrationWorkflow.updateConfig).toHaveBeenCalledWith('from_version', '1.0');
    expect(mockMigrationWorkflow.startVersionMigration).toHaveBeenCalled();
    expect(mockMigrationWorkflow.startPlatformMigration).toHaveBeenCalled();
  });

  it('cancels active operations through workflows', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();
    await vi.runAllTimersAsync();
    await flushPromises();

    const [exportProgress] = exportProgressHandlers;
    exportProgress.begin();
    await flushPromises();

    const cancelButton = wrapper.findAll('button').find(btn => btn.text() === 'Cancel');
    if (!cancelButton) {
      throw new Error('Cancel button not found');
    }
    await cancelButton.trigger('click');

    expect(mockExportWorkflow.cancelExport).toHaveBeenCalled();
  });
});
