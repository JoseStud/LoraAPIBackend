/**
 * Jest tests for import-export modular components
 */

// Mock window functions
global.window = global.window || {};
Object.assign(global.window, {
    createImportExportState: require('../../../app/frontend/static/js/components/import-export/state.js').createImportExportState,
    importExportState: require('../../../app/frontend/static/js/components/import-export/state.js').importExportState,
    exportOperations: require('../../../app/frontend/static/js/components/import-export/export.js').exportOperations,
    importOperations: require('../../../app/frontend/static/js/components/import-export/import.js').importOperations,
    migrationOperations: require('../../../app/frontend/static/js/components/import-export/migration.js').migrationOperations,
    importExportUI: require('../../../app/frontend/static/js/components/import-export/ui.js').importExportUI
});

const { importExport } = require('../../../app/frontend/static/js/components/import-export/index.js');

describe('Import/Export Modular Components', () => {
    
    describe('State Management', () => {
        test('should create initial state with all required properties', () => {
            const state = global.window.createImportExportState();
            
            expect(state.activeTab).toBe('export');
            expect(state.exportConfig).toBeDefined();
            expect(state.importConfig).toBeDefined();
            expect(state.migrationConfig).toBeDefined();
            expect(state.isExporting).toBe(false);
            expect(state.isImporting).toBe(false);
        });
        
        test('should update export configuration', () => {
            const state = global.window.createImportExportState();
            const updated = global.window.importExportState.updateExportConfig(state, { loras: false });
            
            expect(updated.exportConfig.loras).toBe(false);
        });
        
        test('should manage operation states correctly', () => {
            const state = global.window.createImportExportState();
            const updated = global.window.importExportState.setOperationState(state, { operation: 'exporting', isActive: true });
            
            expect(updated.isExporting).toBe(true);
            expect(updated.isImporting).toBe(false);
        });
    });
    
    describe('Export Operations', () => {
        test('should calculate size estimates correctly', () => {
            const config = { 
                loras: true, 
                lora_files: true, 
                generations: false,
                user_data: false,
                system_config: false,
                analytics: false,
                compression: 'balanced'
            };
            const estimates = global.window.exportOperations.calculateEstimates(config);
            
            expect(estimates.size).toContain('MB');
            expect(estimates.time).toContain('minutes');
        });
        
        test('should validate export configuration', () => {
            const validConfig = { loras: true };
            const invalidConfig = { loras: false, generations: false, user_data: false };
            
            const validIssues = global.window.exportOperations.validateExportConfig(validConfig);
            const invalidIssues = global.window.exportOperations.validateExportConfig(invalidConfig);
            
            expect(validIssues).toHaveLength(0);
            expect(invalidIssues.length).toBeGreaterThan(0);
        });
        
        test('should detect export capability', () => {
            const withData = { loras: true, generations: false, user_data: false, system_config: false, analytics: false };
            const withoutData = { loras: false, generations: false, user_data: false, system_config: false, analytics: false };
            
            expect(global.window.exportOperations.canExport(withData)).toBe(true);
            expect(global.window.exportOperations.canExport(withoutData)).toBe(false);
        });
    });
    
    describe('Import Operations', () => {
        test('should validate import files', () => {
            const validFiles = [
                { name: 'test.zip' },
                { name: 'model.safetensors' }
            ];
            const invalidFiles = [
                { name: 'test.txt' },
                { name: 'image.jpg' }
            ];
            
            const validResult = global.window.importOperations.validateImportFiles(validFiles);
            const invalidResult = global.window.importOperations.validateImportFiles(invalidFiles);
            
            expect(validResult).toHaveLength(2);
            expect(invalidResult).toHaveLength(0);
        });
        
        test('should detect encrypted files', () => {
            const regularFiles = [{ name: 'test.zip' }];
            const encryptedFiles = [{ name: 'test_encrypted.zip' }];
            
            expect(global.window.importOperations.detectEncryptedFiles(regularFiles)).toBe(false);
            expect(global.window.importOperations.detectEncryptedFiles(encryptedFiles)).toBe(true);
        });
        
        test('should validate import operation', () => {
            const validConfig = { mode: 'merge', backup_before: true };
            const files = [{ name: 'test.zip' }];
            
            const issues = global.window.importOperations.validateImportOperation(validConfig, files);
            expect(issues).toHaveLength(0);
        });
    });
    
    describe('Migration Operations', () => {
        test('should validate migration configuration', () => {
            const validConfig = {
                source_path: '/path/to/source',
                from_version: '1.0',
                to_version: '2.0',
                source_platform: 'automatic1111'
            };
            const invalidConfig = {
                source_path: '',
                from_version: '1.0',
                to_version: '1.0'
            };
            
            const validIssues = global.window.migrationOperations.validateMigrationConfig(validConfig);
            const invalidIssues = global.window.migrationOperations.validateMigrationConfig(invalidConfig);
            
            expect(validIssues).toHaveLength(0);
            expect(invalidIssues.length).toBeGreaterThan(0);
        });
        
        test('should get supported platforms', () => {
            const platforms = global.window.migrationOperations.getSupportedPlatforms();
            
            expect(platforms).toBeInstanceOf(Array);
            expect(platforms.length).toBeGreaterThan(0);
            expect(platforms[0]).toHaveProperty('id');
            expect(platforms[0]).toHaveProperty('name');
        });
    });
    
    describe('UI Utilities', () => {
        test('should format file sizes correctly', () => {
            expect(global.window.importExportUI.formatFileSize(0)).toBe('0 Bytes');
            expect(global.window.importExportUI.formatFileSize(1024)).toBe('1 KB');
            expect(global.window.importExportUI.formatFileSize(1024 * 1024)).toBe('1 MB');
        });
        
        test('should format dates correctly', () => {
            const date = '2025-09-07T12:00:00Z';
            const formatted = global.window.importExportUI.formatDate(date);
            
            expect(formatted).toContain('Sep');
            expect(formatted).toContain('2025');
        });
        
        test('should validate input correctly', () => {
            const validPassword = global.window.importExportUI.validateInput('password123', 'password');
            const invalidPassword = global.window.importExportUI.validateInput('123', 'password');
            
            expect(validPassword.valid).toBe(true);
            expect(invalidPassword.valid).toBe(false);
        });
        
        test('should get status classes', () => {
            const newClass = global.window.importExportUI.getStatusClasses('new');
            const conflictClass = global.window.importExportUI.getStatusClasses('conflict');
            
            expect(newClass).toContain('green');
            expect(conflictClass).toContain('yellow');
        });
    });
    
    describe('Main Component Integration', () => {
        test('should initialize component with correct state', () => {
            const component = importExport();
            
            expect(component.activeTab).toBe('export');
            expect(component.init).toBeInstanceOf(Function);
            expect(component.startExport).toBeInstanceOf(Function);
            expect(component.startImport).toBeInstanceOf(Function);
        });
        
        test('should handle export validation', () => {
            const component = importExport();
            component.exportConfig = { loras: true };
            
            expect(component.canExport()).toBe(true);
            
            const issues = component.validateExport();
            expect(issues).toBeInstanceOf(Array);
        });
        
        test('should handle file operations', () => {
            const component = importExport();
            
            // Mock file
            const mockFile = { name: 'test.zip' };
            component.importFiles = [mockFile];
            
            component.removeFile(mockFile);
            expect(component.importFiles).toHaveLength(0);
        });
    });
    
});
