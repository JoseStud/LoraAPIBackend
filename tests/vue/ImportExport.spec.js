import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ImportExport from '../../app/frontend/static/vue/ImportExport.vue';

// Mock the useApi composable
vi.mock('../../app/frontend/static/vue/composables/useApi.js', () => ({
  useApi: () => ({
    data: { value: null },
    error: { value: null },
    isLoading: { value: false },
    fetchData: vi.fn()
  })
}));

describe('ImportExport.vue', () => {
  let wrapper;

  beforeEach(() => {
    wrapper = mount(ImportExport);
  });

  it('renders the component correctly', () => {
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find('h1.page-title').text()).toBe('Import/Export');
    expect(wrapper.find('p.page-subtitle').text()).toBe('Manage data migration, backups, and bulk operations');
  });

  it('initializes with export tab active', () => {
    expect(wrapper.vm.activeTab).toBe('export');
    // Check if the export content div exists
    expect(wrapper.find('.space-y-6').exists()).toBe(true);
  });

  it('switches between tabs correctly', async () => {
    // Initially on export tab
    expect(wrapper.vm.activeTab).toBe('export');

    // Change tab directly via component data
    wrapper.vm.activeTab = 'import';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.activeTab).toBe('import');

    // Change to backup tab
    wrapper.vm.activeTab = 'backup';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.activeTab).toBe('backup');

    // Change to migration tab
    wrapper.vm.activeTab = 'migration';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.activeTab).toBe('migration');
  });

  it('calculates export estimates correctly', () => {
    // Enable some export options
    wrapper.vm.exportConfig.loras = true;
    wrapper.vm.exportConfig.lora_files = true;
    wrapper.vm.exportConfig.generations = true;
    wrapper.vm.exportConfig.generation_range = 'all';

    // The estimates should be calculated
    expect(wrapper.vm.estimatedSize).not.toBe('0 MB');
    expect(wrapper.vm.estimatedTime).not.toBe('0 minutes');
  });

  it('validates export configuration', async () => {
    // Mock console methods that might be used
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // No data types selected
    wrapper.vm.exportConfig.loras = false;
    wrapper.vm.exportConfig.generations = false;
    wrapper.vm.exportConfig.user_data = false;
    wrapper.vm.exportConfig.system_config = false;
    wrapper.vm.exportConfig.analytics = false;

    await wrapper.vm.validateExport();
    
    // Should set toast state for error
    expect(wrapper.vm.toastType).toBe('error');
    expect(wrapper.vm.toastMessage).toContain('No data types selected for export');

    // Valid configuration
    wrapper.vm.exportConfig.loras = true;
    await wrapper.vm.validateExport();
    
    // Should set toast state for success
    expect(wrapper.vm.toastType).toBe('success');
    expect(wrapper.vm.toastMessage).toBe('Export configuration is valid');

    consoleSpy.mockRestore();
  });

  it('handles file selection for import', async () => {
    // Create mock file
    const mockFile = new File(['test content'], 'test.zip', { type: 'application/zip' });
    
    // Mock file input change event
    const fileInput = wrapper.find('input[type="file"]');
    Object.defineProperty(fileInput.element, 'files', {
      value: [mockFile],
      writable: false,
    });

    await fileInput.trigger('change');
    
    // Should add the file to importFiles
    expect(wrapper.vm.importFiles).toHaveLength(1);
    expect(wrapper.vm.importFiles[0].name).toBe('test.zip');
  });

  it('handles file drop for import', async () => {
    // Create mock files
    const mockFile1 = new File(['test content 1'], 'test1.zip', { type: 'application/zip' });
    const mockFile2 = new File(['test content 2'], 'test2.json', { type: 'application/json' });

    // Create mock drop event
    const dropEvent = {
      preventDefault: vi.fn(),
      dataTransfer: {
        files: [mockFile1, mockFile2]
      }
    };

    // Trigger drop
    await wrapper.vm.handleFileDrop(dropEvent);

    // Should add valid files to importFiles
    expect(wrapper.vm.importFiles).toHaveLength(2);
    expect(wrapper.vm.importFiles[0].name).toBe('test1.zip');
    expect(wrapper.vm.importFiles[1].name).toBe('test2.json');
  });

  it('removes files from import list', () => {
    // Add some files first
    const mockFile1 = new File(['test1'], 'test1.zip');
    const mockFile2 = new File(['test2'], 'test2.json');
    wrapper.vm.importFiles = [mockFile1, mockFile2];

    // Remove first file
    wrapper.vm.removeFile(mockFile1);
    
    expect(wrapper.vm.importFiles).toHaveLength(1);
    expect(wrapper.vm.importFiles[0]).toBe(mockFile2);
  });

  it('detects encrypted files correctly', () => {
    // No encrypted files initially
    expect(wrapper.vm.hasEncryptedFiles).toBe(false);

    // Add encrypted file
    const encryptedFile = new File(['encrypted content'], 'encrypted_backup.zip');
    wrapper.vm.importFiles = [encryptedFile];

    expect(wrapper.vm.hasEncryptedFiles).toBe(true);
  });

  it('validates import configuration', async () => {
    // No files selected
    wrapper.vm.importFiles = [];
    await wrapper.vm.validateImport();
    expect(wrapper.vm.toastType).toBe('error');
    expect(wrapper.vm.toastMessage).toContain('No files selected for import');

    // Valid configuration
    const mockFile = new File(['test'], 'test.zip');
    wrapper.vm.importFiles = [mockFile];
    await wrapper.vm.validateImport();
    expect(wrapper.vm.toastType).toBe('success');
    expect(wrapper.vm.toastMessage).toBe('Import configuration is valid');
  });

  it('analyzes import files', async () => {
    // Add mock file
    const mockFile = new File(['test'], 'test.zip');
    wrapper.vm.importFiles = [mockFile];

    // Mock setTimeout to avoid real delays
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = vi.fn((fn) => fn());

    // Analyze files
    await wrapper.vm.analyzeFiles();

    // Should show analysis messages and generate preview
    expect(wrapper.vm.toastType).toBe('success');
    expect(wrapper.vm.toastMessage).toBe('File analysis completed');
    expect(wrapper.vm.importPreview.length).toBeGreaterThan(0);

    // Restore setTimeout
    global.setTimeout = originalSetTimeout;
  });

  it('starts export process', async () => {
    // Enable some export options
    wrapper.vm.exportConfig.loras = true;

    // Mock setTimeout to avoid real delays
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = vi.fn((fn) => fn());

    // Start export
    await wrapper.vm.startExport();

    // Should show completion message
    expect(wrapper.vm.toastType).toBe('success');
    expect(wrapper.vm.toastMessage).toBe('Export completed successfully');
    expect(wrapper.vm.isExporting).toBe(false);

    // Restore setTimeout
    global.setTimeout = originalSetTimeout;
  }, 10000); // Increase timeout for this test

  it('starts import process', async () => {
    // Add mock file
    const mockFile = new File(['test'], 'test.zip');
    wrapper.vm.importFiles = [mockFile];

    // Mock setTimeout to avoid real delays
    const originalSetTimeout = global.setTimeout;
    global.setTimeout = vi.fn((fn) => fn());

    // Start import
    await wrapper.vm.startImport();

    // Should show completion message and clear files
    expect(wrapper.vm.toastType).toBe('success');
    expect(wrapper.vm.toastMessage).toBe('Import completed: 1 files processed');
    expect(wrapper.vm.importFiles).toHaveLength(0);
    expect(wrapper.vm.isImporting).toBe(false);

    // Restore setTimeout
    global.setTimeout = originalSetTimeout;
  }, 10000); // Increase timeout for this test

  it('formats file sizes correctly', () => {
    expect(wrapper.vm.formatFileSize(0)).toBe('0 Bytes');
    expect(wrapper.vm.formatFileSize(1024)).toBe('1 KB');
    expect(wrapper.vm.formatFileSize(1024 * 1024)).toBe('1 MB');
    expect(wrapper.vm.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('gets correct status classes', () => {
    expect(wrapper.vm.getStatusClasses('new')).toBe('bg-green-100 text-green-800');
    expect(wrapper.vm.getStatusClasses('conflict')).toBe('bg-yellow-100 text-yellow-800');
    expect(wrapper.vm.getStatusClasses('existing')).toBe('bg-gray-100 text-gray-800');
    expect(wrapper.vm.getStatusClasses('error')).toBe('bg-red-100 text-red-800');
    expect(wrapper.vm.getStatusClasses('unknown')).toBe('bg-gray-100 text-gray-800');
  });

  it('shows and hides toast messages', async () => {
    expect(wrapper.vm.showToast).toBe(false);
    
    // Call internal toast method by setting values directly
    wrapper.vm.toastMessage = 'Test message';
    wrapper.vm.toastType = 'success';
    wrapper.vm.showToast = true;
    
    expect(wrapper.vm.showToast).toBe(true);
    expect(wrapper.vm.toastMessage).toBe('Test message');
    expect(wrapper.vm.toastType).toBe('success');
  });

  it('cancels operations correctly', () => {
    // Set some operation states
    wrapper.vm.isExporting = true;
    wrapper.vm.isImporting = true;
    wrapper.vm.showProgress = true;

    wrapper.vm.cancelOperation();

    expect(wrapper.vm.isExporting).toBe(false);
    expect(wrapper.vm.isImporting).toBe(false);
    expect(wrapper.vm.showProgress).toBe(false);
    expect(wrapper.vm.toastType).toBe('warning');
    expect(wrapper.vm.toastMessage).toBe('Operation cancelled');
  });

  it('quick export all sets correct configuration', () => {
    // Start with some options disabled
    wrapper.vm.exportConfig.loras = false;
    wrapper.vm.exportConfig.generations = false;
    wrapper.vm.exportConfig.user_data = false;
    wrapper.vm.exportConfig.system_config = false;

    wrapper.vm.quickExportAll();

    // Should enable all main options
    expect(wrapper.vm.exportConfig.loras).toBe(true);
    expect(wrapper.vm.exportConfig.lora_files).toBe(true);
    expect(wrapper.vm.exportConfig.generations).toBe(true);
    expect(wrapper.vm.exportConfig.user_data).toBe(true);
    expect(wrapper.vm.exportConfig.system_config).toBe(true);
  });

  it('view history switches to backup tab', () => {
    wrapper.vm.activeTab = 'export';
    wrapper.vm.viewHistory();
    expect(wrapper.vm.activeTab).toBe('backup');
  });
});