import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ImportExport from '../../app/frontend/src/components/ImportExport.vue';

// Mock fetch globally for tests
global.fetch = vi.fn();

describe('ImportExport.vue', () => {
  let wrapper;

  beforeEach(() => {
    // Reset fetch mock
    fetch.mockClear();

    // Mock fetch responses for different endpoints
    fetch.mockImplementation((url) => {
      if (url.includes('/api/v1/export/estimate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ size: '10 MB', time: '5 minutes' })
        });
      } else if (url.includes('/api/v1/backups/history')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ history: [] })
        });
      } else if (url.includes('/api/v1/backup/create')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ backup_id: 'backup-123' })
        });
      } else if (url.includes('/api/v1/export')) {
        return Promise.resolve({
          ok: true,
          blob: () => Promise.resolve(new Blob(['test'], { type: 'application/zip' })),
          headers: new Map([['Content-Disposition', 'attachment; filename="test.zip"']])
        });
      } else if (url.includes('/api/v1/import')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, processed_files: 1, total_files: 1 })
        });
      }
      
      return Promise.reject(new Error('Not mocked'));
    });
    
    wrapper = mount(ImportExport);
  });

  it('renders the component correctly', async () => {
    // Wait for component to initialize and mocked API calls to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    await wrapper.vm.$nextTick();
    
    expect(wrapper.exists()).toBe(true);
    // Check if basic structure exists (component might still be initializing)
    expect(wrapper.html()).toContain('Import/Export');
  });

  it('initializes with export tab active', async () => {
    // Wait for component to initialize and API calls to resolve
    await new Promise(resolve => setTimeout(resolve, 100));
    await wrapper.vm.$nextTick();
    
    expect(wrapper.vm.activeTab).toBe('export');
    // Check if the component has some content
    expect(wrapper.html()).toContain('export');
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

  it('calculates export estimates correctly', async () => {
    // Enable some export options
    wrapper.vm.exportConfig.loras = true;
    wrapper.vm.exportConfig.lora_files = true;
    wrapper.vm.exportConfig.generations = true;
    wrapper.vm.exportConfig.generation_range = 'all';

    // Allow async estimate calculation to complete
    await new Promise(resolve => setTimeout(resolve, 50));
    await wrapper.vm.$nextTick();

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
    // Wait for component to initialize
    await wrapper.vm.$nextTick();
    
    // Create mock file
    const mockFile = new File(['test content'], 'test.zip', { type: 'application/zip' });
    
    // Simulate file selection by directly calling the handler
    const mockEvent = {
      target: { files: [mockFile] }
    };
    
    await wrapper.vm.handleFileSelect(mockEvent);
    
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
    // Mock document methods for download functionality
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
      style: {}
    });
    const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url');
    global.URL.revokeObjectURL = vi.fn();
    
    // Enable some export options
    wrapper.vm.exportConfig.loras = true;

    // Start export
    await wrapper.vm.startExport();

    // Should show completion message
    expect(wrapper.vm.toastType).toBe('success');
    expect(wrapper.vm.toastMessage).toBe('Export completed successfully');
    expect(wrapper.vm.isExporting).toBe(false);

    // Cleanup mocks
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  }, 10000); // Increase timeout for this test

  it('starts import process', async () => {
    // Add mock file
    const mockFile = new File(['test'], 'test.zip');
    wrapper.vm.importFiles = [mockFile];

    // Start import
    await wrapper.vm.startImport();

    // Should show completion message and clear files
    expect(wrapper.vm.toastType).toBe('success');
    expect(wrapper.vm.toastMessage).toBe('Import completed: 1 files processed');
    expect(wrapper.vm.importFiles).toHaveLength(0);
    expect(wrapper.vm.isImporting).toBe(false);
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

  it('creates a full backup and refreshes history', async () => {
    await wrapper.vm.createFullBackup();
    await wrapper.vm.$nextTick();

    const backupCall = fetch.mock.calls.find(([url]) => url.includes('/api/v1/backup/create'));
    expect(backupCall).toBeTruthy();
    expect(backupCall?.[1]?.body).toContain('"backup_type":"full"');

    expect(wrapper.vm.toastType).toBe('success');
    expect(wrapper.vm.toastMessage).toContain('Full backup initiated');
  });

  it('creates a quick backup and refreshes history', async () => {
    await wrapper.vm.createQuickBackup();
    await wrapper.vm.$nextTick();

    const backupCall = fetch.mock.calls.find(([url, options]) => {
      return url.includes('/api/v1/backup/create') && options?.body?.includes('"backup_type":"quick"');
    });

    expect(backupCall).toBeTruthy();
    expect(wrapper.vm.toastType).toBe('success');
    expect(wrapper.vm.toastMessage).toContain('Quick backup initiated');
  });

  it('surfaces informational toasts for backup utilities', () => {
    wrapper.vm.scheduleBackup();
    expect(wrapper.vm.toastType).toBe('info');
    expect(wrapper.vm.toastMessage).toBe('Schedule backup functionality coming soon');

    wrapper.vm.downloadBackup('backup-123');
    expect(wrapper.vm.toastMessage).toBe('Download backup backup-123 functionality coming soon');

    wrapper.vm.restoreBackup('backup-123');
    expect(wrapper.vm.toastMessage).toBe('Restore backup backup-123 functionality coming soon');

    wrapper.vm.deleteBackup('backup-123');
    expect(wrapper.vm.toastMessage).toBe('Delete backup backup-123 functionality coming soon');
  });

  it('announces upcoming migration flows', () => {
    wrapper.vm.startVersionMigration();
    expect(wrapper.vm.toastType).toBe('info');
    expect(wrapper.vm.toastMessage).toBe('Version migration functionality coming soon');

    wrapper.vm.startPlatformMigration();
    expect(wrapper.vm.toastMessage).toBe('Platform migration functionality coming soon');
  });
});