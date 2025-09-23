import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, reactive, ref } from 'vue';
import { mount } from '@vue/test-utils';

import ImportExport from '../../app/frontend/src/components/ImportExport.vue';

function stubComponent(name) {
  return defineComponent({
    name,
    emits: [],
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
  default: stubComponent('ExportConfigurationPanel')
}));

vi.mock('@/components/import-export/ImportProcessingPanel.vue', () => ({
  default: stubComponent('ImportProcessingPanel')
}));

vi.mock('@/components/import-export/BackupManagementPanel.vue', () => ({
  default: stubComponent('BackupManagementPanel')
}));

vi.mock('@/components/import-export/MigrationWorkflowPanel.vue', () => ({
  default: stubComponent('MigrationWorkflowPanel')
}));

describe('ImportExport.vue', () => {
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
    const wrapper = mount(ImportExport);
    await vi.runAllTimersAsync();

    expect(mockExportWorkflow.initialize).toHaveBeenCalled();
    expect(mockBackupWorkflow.initialize).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Import/Export');
  });

  it('invokes quick export workflow from header action', async () => {
    const wrapper = mount(ImportExport);
    await vi.runAllTimersAsync();

    await wrapper.find('button.btn-primary.btn-sm').trigger('click');
    expect(mockExportWorkflow.quickExportAll).toHaveBeenCalled();
  });

  it('routes history view to backup tab', async () => {
    const wrapper = mount(ImportExport);
    await vi.runAllTimersAsync();

    const historyButton = wrapper.findAll('button.btn-secondary.btn-sm').at(0);
    await historyButton.trigger('click');

    expect(wrapper.html()).toContain('Backup/Restore');
  });

  it('forwards export panel actions to workflow', async () => {
    const wrapper = mount(ImportExport);
    await vi.runAllTimersAsync();

    const exportPanel = wrapper.findComponent({ name: 'ExportConfigurationPanel' });
    exportPanel.vm.$emit('update-config', { key: 'loras', value: true });
    exportPanel.vm.$emit('validate');
    exportPanel.vm.$emit('preview');
    exportPanel.vm.$emit('start');

    expect(mockExportWorkflow.updateConfig).toHaveBeenCalledWith('loras', true);
    expect(mockExportWorkflow.validateExport).toHaveBeenCalled();
    expect(mockExportWorkflow.previewExport).toHaveBeenCalled();
    expect(mockExportWorkflow.startExport).toHaveBeenCalled();
  });

  it('forwards import panel events to workflow', async () => {
    const wrapper = mount(ImportExport);
    await vi.runAllTimersAsync();

    const importPanel = wrapper.findComponent({ name: 'ImportProcessingPanel' });
    const file = new File(['test'], 'test.zip');

    importPanel.vm.$emit('update-config', { key: 'mode', value: 'replace' });
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
    const wrapper = mount(ImportExport);
    await vi.runAllTimersAsync();

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
    const wrapper = mount(ImportExport);
    await vi.runAllTimersAsync();

    const migrationPanel = wrapper.findComponent({ name: 'MigrationWorkflowPanel' });
    migrationPanel.vm.$emit('update-config', { key: 'from_version', value: '1.0' });
    migrationPanel.vm.$emit('start-version-migration');
    migrationPanel.vm.$emit('start-platform-migration');

    expect(mockMigrationWorkflow.updateConfig).toHaveBeenCalledWith('from_version', '1.0');
    expect(mockMigrationWorkflow.startVersionMigration).toHaveBeenCalled();
    expect(mockMigrationWorkflow.startPlatformMigration).toHaveBeenCalled();
  });

  it('cancels active operations through workflows', async () => {
    const wrapper = mount(ImportExport);
    await vi.runAllTimersAsync();

    const [exportProgress] = exportProgressHandlers;
    exportProgress.begin();

    const cancelButton = wrapper.findAll('button').find(btn => btn.text() === 'Cancel');
    await cancelButton.trigger('click');

    expect(mockExportWorkflow.cancelExport).toHaveBeenCalled();
  });
});
