import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computed, reactive, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';

import ImportExportContainer from '../../app/frontend/src/components/import-export/ImportExportContainer.vue';

const contextState = { context: null };

function createMockExportWorkflow() {
  const exportConfig = reactive({
    loras: true,
    lora_files: true,
    lora_metadata: true,
    lora_embeddings: false,
    generations: false,
    generation_range: 'all',
    date_from: '',
    date_to: '',
    user_data: false,
    system_config: false,
    analytics: false,
    format: 'zip',
    compression: 'balanced',
    split_archives: false,
    max_size_mb: 1024,
    encrypt: false,
    password: ''
  });

  const isExporting = ref(false);

  return {
    exportConfig,
    canExport: ref(true),
    estimatedSize: ref('10 MB'),
    estimatedTime: ref('5 minutes'),
    isExporting: computed(() => isExporting.value),
    initialize: vi.fn().mockResolvedValue(undefined),
    updateConfig: vi.fn((key, value) => {
      exportConfig[key] = value;
    }),
    validateExport: vi.fn(),
    previewExport: vi.fn(),
    startExport: vi.fn(() => {
      isExporting.value = true;
      isExporting.value = false;
    }),
    quickExportAll: vi.fn(),
    cancelExport: vi.fn()
  };
}

function createMockImportWorkflow() {
  const importConfig = reactive({
    mode: 'merge',
    conflict_resolution: 'ask',
    validate: true,
    backup_before: true,
    password: ''
  });
  const files = ref([]);
  const preview = ref([]);
  const isImporting = ref(false);

  return {
    importConfig,
    importFiles: computed(() => files.value),
    importPreview: computed(() => preview.value),
    hasEncryptedFiles: computed(() => files.value.some(file => file.name.includes('encrypted'))),
    isImporting: computed(() => isImporting.value),
    updateConfig: vi.fn((key, value) => {
      importConfig[key] = value;
    }),
    addFiles: vi.fn((newFiles) => {
      files.value = [...files.value, ...newFiles];
    }),
    removeFile: vi.fn((file) => {
      files.value = files.value.filter(existing => existing !== file);
    }),
    clearFiles: vi.fn(() => {
      files.value = [];
      preview.value = [];
    }),
    analyzeFiles: vi.fn().mockResolvedValue(undefined),
    validateImport: vi.fn(),
    startImport: vi.fn(() => {
      isImporting.value = true;
      isImporting.value = false;
    }),
    cancelImport: vi.fn(() => {
      isImporting.value = false;
    }),
    __files: files,
    __preview: preview
  };
}

function createMockBackupWorkflow() {
  return {
  backupHistory: ref([
    {
      id: 'backup-1',
      created_at: '2024-01-01T00:00:00Z',
      type: 'full',
      size: 1024,
      status: 'completed'
    }
  ]),
  initialize: vi.fn().mockResolvedValue(undefined),
  createFullBackup: vi.fn(),
  createQuickBackup: vi.fn(),
  scheduleBackup: vi.fn(),
  downloadBackup: vi.fn(),
  restoreBackup: vi.fn(),
  deleteBackup: vi.fn()
  };
}

function createMockMigrationWorkflow() {
  const migrationConfig = reactive({
    from_version: '2.0',
    to_version: '2.1',
    source_platform: 'automatic1111',
    source_path: ''
  });

  return {
    migrationConfig,
    updateConfig: vi.fn((key, value) => {
      migrationConfig[key] = value;
    }),
    startVersionMigration: vi.fn(),
    startPlatformMigration: vi.fn()
  };
}

let mockExportWorkflow = createMockExportWorkflow();
let mockImportWorkflow = createMockImportWorkflow();
let mockBackupWorkflow = createMockBackupWorkflow();
let mockMigrationWorkflow = createMockMigrationWorkflow();

function resetWorkflows() {
  mockExportWorkflow = createMockExportWorkflow();
  mockImportWorkflow = createMockImportWorkflow();
  mockBackupWorkflow = createMockBackupWorkflow();
  mockMigrationWorkflow = createMockMigrationWorkflow();
}

function createMockContext() {
  const isInitialized = ref(false);
  const activeTab = ref('export');

  const showToast = ref(false);
  const toastMessage = ref('');
  const toastType = ref('info');
  const notify = vi.fn((message, type = 'info') => {
    toastMessage.value = message;
    toastType.value = type;
    showToast.value = true;
  });

  const showProgress = ref(false);
  const progressTitle = ref('Progress');
  const progressValue = ref(0);
  const currentStep = ref('');
  const messages = ref([]);
  const currentOperation = ref(null);

  const actions = {
    setActiveTab: vi.fn((value) => {
      activeTab.value = value;
    }),
    quickExportAll: vi.fn(() => {
      mockExportWorkflow.quickExportAll();
    }),
    viewHistory: vi.fn(() => {
      activeTab.value = 'backup';
    }),
    updateExportConfig: vi.fn((key, value) => {
      mockExportWorkflow.updateConfig(key, value);
    }),
    validateExport: vi.fn(() => {
      mockExportWorkflow.validateExport();
    }),
    previewExport: vi.fn(() => {
      mockExportWorkflow.previewExport();
    }),
    startExport: vi.fn(() => {
      mockExportWorkflow.startExport();
    }),
    updateImportConfig: vi.fn((key, value) => {
      mockImportWorkflow.updateConfig(key, value);
    }),
    addImportFiles: vi.fn((files) => {
      const list = Array.isArray(files) ? [...files] : Array.from(files ?? []);
      mockImportWorkflow.addFiles(list);
    }),
    removeImportFile: vi.fn((file) => {
      mockImportWorkflow.removeFile(file);
    }),
    analyzeFiles: vi.fn(() => {
      mockImportWorkflow.analyzeFiles();
    }),
    validateImport: vi.fn(() => {
      mockImportWorkflow.validateImport();
    }),
    startImport: vi.fn(() => {
      mockImportWorkflow.startImport();
    }),
    createFullBackup: vi.fn(() => {
      mockBackupWorkflow.createFullBackup();
    }),
    createQuickBackup: vi.fn(() => {
      mockBackupWorkflow.createQuickBackup();
    }),
    scheduleBackup: vi.fn(() => {
      mockBackupWorkflow.scheduleBackup();
    }),
    downloadBackup: vi.fn((id) => {
      mockBackupWorkflow.downloadBackup(id);
    }),
    restoreBackup: vi.fn((id) => {
      mockBackupWorkflow.restoreBackup(id);
    }),
    deleteBackup: vi.fn((id) => {
      mockBackupWorkflow.deleteBackup(id);
    }),
    updateMigrationConfig: vi.fn((key, value) => {
      mockMigrationWorkflow.updateConfig(key, value);
    }),
    startVersionMigration: vi.fn(() => {
      mockMigrationWorkflow.startVersionMigration();
    }),
    startPlatformMigration: vi.fn(() => {
      mockMigrationWorkflow.startPlatformMigration();
    }),
    cancelOperation: vi.fn(() => {
      const operation = currentOperation.value;
      if (operation === 'export') {
        mockExportWorkflow.cancelExport();
      } else if (operation === 'import') {
        mockImportWorkflow.cancelImport();
      }
      showProgress.value = false;
      currentOperation.value = null;
      notify('Operation cancelled', 'warning');
    })
  };

  return {
    isInitialized,
    activeTab,
    toast: {
      show: showToast,
      message: toastMessage,
      type: toastType,
      notify
    },
    progress: {
      show: showProgress,
      title: progressTitle,
      value: progressValue,
      currentStep,
      messages,
      currentOperation
    },
    exportWorkflow: mockExportWorkflow,
    importWorkflow: mockImportWorkflow,
    backupWorkflow: mockBackupWorkflow,
    migrationWorkflow: mockMigrationWorkflow,
    formatFileSize: vi.fn((bytes) => `${bytes} bytes`),
    formatDate: vi.fn((input) => input),
    getStatusClasses: vi.fn(() => 'bg-gray-100 text-gray-800'),
    actions,
    initialize: vi.fn(async () => {
      await Promise.all([mockExportWorkflow.initialize(), mockBackupWorkflow.initialize()]);
      isInitialized.value = true;
    })
  };
}

vi.mock('@/composables/import-export', () => ({
  provideImportExportContext: vi.fn(() => {
    const context = createMockContext();
    contextState.context = context;
    return context;
  }),
  useImportExportContext: vi.fn(() => {
    if (!contextState.context) {
      throw new Error('ImportExportContext has not been provided');
    }
    return contextState.context;
  }),
  useExportConfigFields: (handler) => ({
    onCheckboxChange: (key, event) => {
      handler(key, event?.target?.checked ?? false);
    },
    onRadioChange: (key, event) => {
      handler(key, event?.target?.value ?? '');
    },
    onInputChange: (key, event) => {
      handler(key, event?.target?.value ?? '');
    },
    onNumberInput: (key, event) => {
      const raw = event?.target?.value;
      const parsed = raw === '' || raw == null ? 0 : Number(raw);
      handler(key, Number.isNaN(parsed) ? 0 : parsed);
    }
  })
}));

describe('ImportExportContainer.vue', () => {
  beforeEach(() => {
    resetWorkflows();
    contextState.context = null;
  });

  afterEach(() => {
    contextState.context = null;
  });

  it('initializes workflows on mount', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    expect(mockExportWorkflow.initialize).toHaveBeenCalled();
    expect(mockBackupWorkflow.initialize).toHaveBeenCalled();
    expect(wrapper.text()).toContain('Import/Export');
  });

  it('emits initialized event after setup', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    expect(wrapper.emitted().initialized).toHaveLength(1);
  });

  it('triggers quick export workflow from header action', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    await wrapper.find('button.btn-primary.btn-sm').trigger('click');
    expect(mockExportWorkflow.quickExportAll).toHaveBeenCalled();
  });

  it('switches to backup tab when history is requested', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    const historyButton = wrapper.findAll('button.btn-secondary.btn-sm').at(0);
    expect(historyButton).toBeTruthy();
    await historyButton?.trigger('click');

    expect(contextState.context?.activeTab.value).toBe('backup');
  });

  it('updates export configuration when toggles change', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    const firstCheckbox = wrapper.find('input[type="checkbox"]');
    await firstCheckbox.setValue(false);

    expect(mockExportWorkflow.updateConfig).toHaveBeenCalledWith('loras', false);
  });

  it('validates and starts export through panel actions', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    const actionButtons = wrapper.findAll('.card .btn.btn-secondary');
    await actionButtons[0].trigger('click');
    await actionButtons[1].trigger('click');
    await wrapper.find('.card .btn.btn-primary').trigger('click');

    expect(mockExportWorkflow.validateExport).toHaveBeenCalled();
    expect(mockExportWorkflow.previewExport).toHaveBeenCalled();
    expect(mockExportWorkflow.startExport).toHaveBeenCalled();
  });

  it('handles import workflow interactions', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    const tabButtons = wrapper.findAll('.tab-button');
    await tabButtons[1].trigger('click');

    const context = contextState.context;
    expect(context).toBeTruthy();
    if (!context) return;

    context.actions.updateImportConfig('mode', 'replace');
    const file = new File(['test'], 'test.zip');
    context.actions.addImportFiles([file]);
    await flushPromises();

    const analyzeButton = wrapper.findAll('button').find(button => button.text() === 'Analyze Files');
    const validateButton = wrapper.findAll('button').find(button => button.text() === 'Validate Import');
    const startButton = wrapper.findAll('button').find(button => button.text() === 'Start Import');

    await analyzeButton?.trigger('click');
    await validateButton?.trigger('click');
    await startButton?.trigger('click');

    expect(mockImportWorkflow.updateConfig).toHaveBeenCalledWith('mode', 'replace');
    expect(mockImportWorkflow.analyzeFiles).toHaveBeenCalled();
    expect(mockImportWorkflow.validateImport).toHaveBeenCalled();
    expect(mockImportWorkflow.startImport).toHaveBeenCalled();
  });

  it('invokes backup workflow actions', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    const tabButtons = wrapper.findAll('.tab-button');
    await tabButtons[2].trigger('click');

    const backupCards = wrapper.findAll('.card.card-interactive');
    await backupCards[0].trigger('click');
    await backupCards[1].trigger('click');
    await backupCards[2].trigger('click');

    const actionLinks = wrapper.findAll('td .flex.space-x-2 button');
    for (const link of actionLinks) {
      await link.trigger('click');
    }

    expect(mockBackupWorkflow.createFullBackup).toHaveBeenCalled();
    expect(mockBackupWorkflow.createQuickBackup).toHaveBeenCalled();
    expect(mockBackupWorkflow.scheduleBackup).toHaveBeenCalled();
    expect(mockBackupWorkflow.downloadBackup).toHaveBeenCalled();
    expect(mockBackupWorkflow.restoreBackup).toHaveBeenCalled();
    expect(mockBackupWorkflow.deleteBackup).toHaveBeenCalled();
  });

  it('handles migration configuration updates', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    const tabButtons = wrapper.findAll('.tab-button');
    await tabButtons[3].trigger('click');

    const versionCard = wrapper
      .findAll('.card')
      .find(card => card.find('h3').text() === 'Version Migration');
    const platformCard = wrapper
      .findAll('.card')
      .find(card => card.find('h3').text() === 'Platform Migration');

    await versionCard?.findAll('select')[0].setValue('1.1');
    await versionCard?.findAll('select')[1].setValue('3.0');
    await platformCard?.find('select')?.setValue('invokeai');
    await platformCard?.find('input[type="text"]').setValue('/data/path');

    const migrationButtons = wrapper.findAll('.card .btn.btn-primary').slice(-2);
    await migrationButtons[0].trigger('click');
    await migrationButtons[1].trigger('click');

    expect(mockMigrationWorkflow.updateConfig).toHaveBeenCalledWith('from_version', '1.1');
    expect(mockMigrationWorkflow.updateConfig).toHaveBeenCalledWith('to_version', '3.0');
    expect(mockMigrationWorkflow.updateConfig).toHaveBeenCalledWith('source_platform', 'invokeai');
    expect(mockMigrationWorkflow.updateConfig).toHaveBeenCalledWith('source_path', '/data/path');
    expect(mockMigrationWorkflow.startVersionMigration).toHaveBeenCalled();
    expect(mockMigrationWorkflow.startPlatformMigration).toHaveBeenCalled();
  });

  it('cancels operations via progress modal', async () => {
    const wrapper = mount(ImportExportContainer);
    await flushPromises();

    const context = contextState.context;
    expect(context).toBeTruthy();
    if (!context) return;

    context.progress.show.value = true;
    context.progress.currentOperation.value = 'export';
    await flushPromises();

    const cancelButton = wrapper.find('.bg-gray-50 button');
    expect(cancelButton.exists()).toBe(true);
    await cancelButton.trigger('click');

    expect(mockExportWorkflow.cancelExport).toHaveBeenCalled();
    expect(context.toast.notify).toHaveBeenCalledWith('Operation cancelled', 'warning');
  });
});
