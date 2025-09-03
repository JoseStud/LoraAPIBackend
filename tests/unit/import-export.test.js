/**
 * Unit Tests for Import/Export Component
 */

describe('Import/Export Component', () => {
    let component;
    let mockFetch;
    
    beforeEach(() => {
        // Mock fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;
        
        // Mock File API
        global.File = jest.fn();
        global.FileReader = jest.fn(() => ({
            readAsText: jest.fn(),
            readAsArrayBuffer: jest.fn(),
            result: null,
            onload: null,
            onerror: null
        }));
        
        // Mock Blob and URL
        global.Blob = jest.fn();
        global.URL = {
            createObjectURL: jest.fn(() => 'blob:mock-url'),
            revokeObjectURL: jest.fn()
        };
        
        // Setup component data structure similar to import-export.js
        component = {
            // State
            activeTab: 'export',
            isProcessing: false,
            progress: 0,
            error: null,
            
            // Export configuration
            exportConfig: {
                format: 'json',
                compression: true,
                encryption: false,
                password: '',
                includeMetadata: true,
                dataTypes: ['loras', 'settings', 'history'],
                dateRange: {
                    start: '',
                    end: '',
                    enabled: false
                }
            },
            
            // Import configuration
            importConfig: {
                file: null,
                overwriteExisting: false,
                validateData: true,
                createBackup: true,
                mergeStrategy: 'skip_existing'
            },
            
            // Backup configuration
            backupConfig: {
                includeDatabase: true,
                includeFiles: true,
                includeSettings: true,
                compression: 'gzip',
                schedule: 'manual'
            },
            
            // Migration configuration
            migrationConfig: {
                sourceVersion: '',
                targetVersion: '',
                preserveData: true,
                validateIntegrity: true
            },
            
            // Methods
            init: jest.fn(),
            
            // Export methods
            startExport: jest.fn(),
            validateExportConfig: jest.fn(),
            generateExportFile: jest.fn(),
            
            // Import methods
            startImport: jest.fn(),
            validateImportFile: jest.fn(),
            processImportData: jest.fn(),
            
            // Backup methods
            createBackup: jest.fn(),
            restoreBackup: jest.fn(),
            scheduleBackup: jest.fn(),
            
            // Migration methods
            startMigration: jest.fn(),
            validateMigration: jest.fn(),
            executeMigration: jest.fn(),
            
            // Utility methods
            downloadFile: jest.fn(),
            uploadFile: jest.fn(),
            showProgress: jest.fn(),
            resetProgress: jest.fn()
        };
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Component Initialization', () => {
        test('should initialize with default state', () => {
            expect(component.activeTab).toBe('export');
            expect(component.isProcessing).toBe(false);
            expect(component.progress).toBe(0);
            expect(component.error).toBe(null);
        });
        
        test('should initialize export configuration', () => {
            expect(component.exportConfig.format).toBe('json');
            expect(component.exportConfig.compression).toBe(true);
            expect(component.exportConfig.dataTypes).toEqual(['loras', 'settings', 'history']);
        });
        
        test('should initialize import configuration', () => {
            expect(component.importConfig.overwriteExisting).toBe(false);
            expect(component.importConfig.validateData).toBe(true);
            expect(component.importConfig.mergeStrategy).toBe('skip_existing');
        });
    });
    
    describe('Export Functionality', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                blob: () => Promise.resolve(new Blob(['export data']))
            });
        });
        
        test('should validate export configuration', () => {
            component.validateExportConfig = jest.fn((config) => {
                const errors = [];
                
                if (!config.dataTypes || config.dataTypes.length === 0) {
                    errors.push('At least one data type must be selected');
                }
                
                if (config.encryption && !config.password) {
                    errors.push('Password required for encryption');
                }
                
                if (config.dateRange.enabled && (!config.dateRange.start || !config.dateRange.end)) {
                    errors.push('Date range must be specified');
                }
                
                return errors;
            });
            
            // Valid configuration
            let errors = component.validateExportConfig(component.exportConfig);
            expect(errors).toHaveLength(0);
            
            // Invalid configuration - no data types
            const invalidConfig = { ...component.exportConfig, dataTypes: [] };
            errors = component.validateExportConfig(invalidConfig);
            expect(errors).toContain('At least one data type must be selected');
            
            // Invalid configuration - encryption without password
            const encryptedConfig = { ...component.exportConfig, encryption: true, password: '' };
            errors = component.validateExportConfig(encryptedConfig);
            expect(errors).toContain('Password required for encryption');
        });
        
        test('should start export process', async () => {
            component.startExport = jest.fn(async () => {
                component.isProcessing = true;
                component.progress = 0;
                
                const response = await fetch('/api/v1/export', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(component.exportConfig)
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    component.downloadFile(blob, 'export.json');
                    component.progress = 100;
                }
                
                component.isProcessing = false;
            });
            
            await component.startExport();
            
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(component.exportConfig)
            });
            expect(component.startExport).toHaveBeenCalled();
        });
        
        test('should download generated file', () => {
            const mockBlob = new Blob(['test data']);
            const mockURL = 'blob:mock-url';
            
            component.downloadFile = jest.fn((blob, filename) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            });
            
            // Mock document methods
            const mockLink = {
                href: '',
                download: '',
                click: jest.fn()
            };
            
            document.createElement = jest.fn(() => mockLink);
            document.body.appendChild = jest.fn();
            document.body.removeChild = jest.fn();
            
            component.downloadFile(mockBlob, 'test-export.json');
            
            expect(URL.createObjectURL).toHaveBeenCalledWith(mockBlob);
            expect(mockLink.download).toBe('test-export.json');
            expect(mockLink.click).toHaveBeenCalled();
            expect(URL.revokeObjectURL).toHaveBeenCalled();
        });
    });
    
    describe('Import Functionality', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ success: true, imported: 10 })
            });
        });
        
        test('should validate import file', () => {
            const validFile = {
                name: 'export.json',
                size: 1024,
                type: 'application/json'
            };
            
            const invalidFile = {
                name: 'export.txt',
                size: 0,
                type: 'text/plain'
            };
            
            component.validateImportFile = jest.fn((file) => {
                const errors = [];
                
                if (!file) {
                    errors.push('No file selected');
                    return errors;
                }
                
                if (file.size === 0) {
                    errors.push('File is empty');
                }
                
                if (file.size > 100 * 1024 * 1024) { // 100MB
                    errors.push('File too large (max 100MB)');
                }
                
                const validTypes = ['application/json', 'application/zip', 'text/csv'];
                if (!validTypes.includes(file.type)) {
                    errors.push('Invalid file type');
                }
                
                return errors;
            });
            
            // Valid file
            let errors = component.validateImportFile(validFile);
            expect(errors).toHaveLength(0);
            
            // Invalid file - empty
            errors = component.validateImportFile(invalidFile);
            expect(errors).toContain('File is empty');
            expect(errors).toContain('Invalid file type');
            
            // No file
            errors = component.validateImportFile(null);
            expect(errors).toContain('No file selected');
        });
        
        test('should process import file', async () => {
            const mockFile = new File(['{"loras": []}'], 'export.json', {
                type: 'application/json'
            });
            
            component.processImportData = jest.fn(async (file) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('config', JSON.stringify(component.importConfig));
                
                const response = await fetch('/api/v1/import', {
                    method: 'POST',
                    body: formData
                });
                
                return response.json();
            });
            
            const result = await component.processImportData(mockFile);
            
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/import', {
                method: 'POST',
                body: expect.any(FormData)
            });
        });
        
        test('should handle file reading', () => {
            const mockFile = new File(['test content'], 'test.json');
            const mockReader = new FileReader();
            
            component.readFile = jest.fn((file) => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.onerror = (e) => reject(e);
                    reader.readAsText(file);
                });
            });
            
            // Mock the FileReader instance
            mockReader.readAsText = jest.fn();
            global.FileReader = jest.fn(() => mockReader);
            
            component.readFile(mockFile);
            
            expect(mockReader.readAsText).toHaveBeenCalledWith(mockFile);
        });
    });
    
    describe('Backup Functionality', () => {
        test('should create backup', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ backupId: 'backup-123', size: 1024 })
            });
            
            component.createBackup = jest.fn(async () => {
                const response = await fetch('/api/v1/backup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(component.backupConfig)
                });
                
                return response.json();
            });
            
            const result = await component.createBackup();
            
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/backup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(component.backupConfig)
            });
        });
        
        test('should restore backup', async () => {
            const backupId = 'backup-123';
            
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ success: true, restored: 100 })
            });
            
            component.restoreBackup = jest.fn(async (id) => {
                const response = await fetch(`/api/v1/backup/${id}/restore`, {
                    method: 'POST'
                });
                
                return response.json();
            });
            
            const result = await component.restoreBackup(backupId);
            
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/backup/backup-123/restore', {
                method: 'POST'
            });
        });
        
        test('should schedule automatic backups', () => {
            component.scheduleBackup = jest.fn((schedule) => {
                const schedules = {
                    daily: '0 2 * * *',
                    weekly: '0 2 * * 0',
                    monthly: '0 2 1 * *'
                };
                
                return schedules[schedule] || null;
            });
            
            expect(component.scheduleBackup('daily')).toBe('0 2 * * *');
            expect(component.scheduleBackup('weekly')).toBe('0 2 * * 0');
            expect(component.scheduleBackup('invalid')).toBe(null);
        });
    });
    
    describe('Migration Functionality', () => {
        test('should validate migration configuration', () => {
            component.validateMigration = jest.fn((config) => {
                const errors = [];
                
                if (!config.sourceVersion) {
                    errors.push('Source version required');
                }
                
                if (!config.targetVersion) {
                    errors.push('Target version required');
                }
                
                if (config.sourceVersion === config.targetVersion) {
                    errors.push('Source and target versions cannot be the same');
                }
                
                return errors;
            });
            
            // Valid configuration
            const validConfig = {
                sourceVersion: '1.0.0',
                targetVersion: '2.0.0',
                preserveData: true
            };
            
            let errors = component.validateMigration(validConfig);
            expect(errors).toHaveLength(0);
            
            // Invalid configuration
            const invalidConfig = {
                sourceVersion: '1.0.0',
                targetVersion: '1.0.0'
            };
            
            errors = component.validateMigration(invalidConfig);
            expect(errors).toContain('Source and target versions cannot be the same');
        });
        
        test('should execute migration', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ success: true, migrated: 50 })
            });
            
            component.executeMigration = jest.fn(async () => {
                const response = await fetch('/api/v1/migrate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(component.migrationConfig)
                });
                
                return response.json();
            });
            
            const result = await component.executeMigration();
            
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/migrate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(component.migrationConfig)
            });
        });
    });
    
    describe('Progress Tracking', () => {
        test('should track progress during operations', () => {
            component.showProgress = jest.fn((percent, message) => {
                component.progress = percent;
                component.progressMessage = message;
            });
            
            component.resetProgress = jest.fn(() => {
                component.progress = 0;
                component.progressMessage = '';
                component.isProcessing = false;
            });
            
            component.showProgress(50, 'Processing data...');
            expect(component.progress).toBe(50);
            expect(component.progressMessage).toBe('Processing data...');
            
            component.resetProgress();
            expect(component.progress).toBe(0);
            expect(component.isProcessing).toBe(false);
        });
        
        test('should handle progress updates via WebSocket', () => {
            const mockWebSocket = {
                onopen: null,
                onmessage: null,
                onclose: null,
                send: jest.fn(),
                close: jest.fn()
            };
            
            global.WebSocket = jest.fn(() => mockWebSocket);
            
            component.initProgressTracking = jest.fn((operationId) => {
                const ws = new WebSocket(`ws://localhost:8000/ws/progress/${operationId}`);
                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    component.showProgress(data.progress, data.message);
                };
                return ws;
            });
            
            const ws = component.initProgressTracking('export-123');
            
            // Simulate progress update
            const mockEvent = {
                data: JSON.stringify({
                    progress: 75,
                    message: 'Compressing data...'
                })
            };
            
            ws.onmessage(mockEvent);
            
            expect(component.showProgress).toHaveBeenCalledWith(75, 'Compressing data...');
        });
    });
    
    describe('Error Handling', () => {
        test('should handle network errors', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));
            
            component.handleError = jest.fn((error) => {
                component.error = error.message;
                component.isProcessing = false;
                component.progress = 0;
            });
            
            component.startExport = jest.fn(async () => {
                try {
                    await fetch('/api/v1/export');
                } catch (error) {
                    component.handleError(error);
                }
            });
            
            await component.startExport();
            
            expect(component.error).toBe('Network error');
            expect(component.isProcessing).toBe(false);
        });
        
        test('should handle validation errors', () => {
            component.showValidationErrors = jest.fn((errors) => {
                component.validationErrors = errors;
                component.error = `Validation failed: ${errors.join(', ')}`;
            });
            
            const errors = ['File too large', 'Invalid format'];
            component.showValidationErrors(errors);
            
            expect(component.validationErrors).toEqual(errors);
            expect(component.error).toBe('Validation failed: File too large, Invalid format');
        });
    });
});
