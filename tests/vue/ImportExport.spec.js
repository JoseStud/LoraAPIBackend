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

vi.mock('@/composables/useExportWorkflow', () => ({
  useExportWorkflow: vi.fn((options) => {
    exportProgressHandlers.push(options.progress);
    return mockExportWorkflow;
  })
}));

vi.mock('@/composables/useImportWorkflow', () => ({
  useImportWorkflow: vi.fn(() => mockImportWorkflow)
}));

vi.mock('@/composables/useBackupWorkflow', () => ({
  useBackupWorkflow: vi.fn(() => mockBackupWorkflow)
}));

vi.mock('@/composables/useMigrationWorkflow', () => ({
  useMigrationWorkflow: vi.fn(() => mockMigrationWorkflow)
}));

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
