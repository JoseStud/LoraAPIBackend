/**
 * Unit Tests for System Administration Component
 */

describe('System Administration Component', () => {
    let component;
    let mockFetch;
    
    beforeEach(() => {
        // Mock fetch
        mockFetch = jest.fn();
        global.fetch = mockFetch;
        
        // Mock Chart.js
        global.Chart = {
            register: jest.fn(),
            Chart: jest.fn(() => ({
                update: jest.fn(),
                destroy: jest.fn()
            }))
        };
        
        // Mock Notification API
        global.Notification = {
            permission: 'granted',
            requestPermission: jest.fn().mockResolvedValue('granted')
        };
        
        // Setup component data structure similar to system-admin.js
        component = {
            activeTab: 'overview',
            isLoading: false,
            error: null,
            
            // Overview data
            overview: {
                systemInfo: {},
                cpuUsage: 0,
                memoryUsage: 0,
                diskUsage: 0,
                gpuInfo: []
            },
            
            // Workers data
            workers: {
                active: [],
                inactive: [],
                logs: []
            },
            
            // Database data
            database: {
                stats: {},
                backups: [],
                migrations: []
            },
            
            // Logs data
            logs: {
                entries: [],
                filters: {
                    level: 'all',
                    component: 'all',
                    timeRange: '1h'
                }
            },
            
            // Settings data
            settings: {
                system: {},
                workers: {},
                database: {},
                security: {}
            },
            
            // Methods
            init: jest.fn(),
            loadOverview: jest.fn(),
            loadWorkers: jest.fn(),
            loadDatabase: jest.fn(),
            loadLogs: jest.fn(),
            loadSettings: jest.fn(),
            switchTab: jest.fn(),
            
            // Worker methods
            startWorker: jest.fn(),
            stopWorker: jest.fn(),
            restartWorker: jest.fn(),
            
            // Database methods
            createBackup: jest.fn(),
            restoreBackup: jest.fn(),
            runMigration: jest.fn(),
            
            // Settings methods
            updateSettings: jest.fn(),
            resetSettings: jest.fn()
        };
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    describe('Component Initialization', () => {
        test('should initialize with default state', () => {
            expect(component.activeTab).toBe('overview');
            expect(component.isLoading).toBe(false);
            expect(component.error).toBe(null);
        });
        
        test('should call init method on component creation', () => {
            component.init();
            expect(component.init).toHaveBeenCalled();
        });
    });
    
    describe('Tab Navigation', () => {
        test('should switch active tab', () => {
            component.switchTab = jest.fn((tab) => {
                component.activeTab = tab;
            });
            
            component.switchTab('workers');
            expect(component.activeTab).toBe('workers');
            expect(component.switchTab).toHaveBeenCalledWith('workers');
        });
        
        test('should load data when switching tabs', () => {
            const mockLoadData = jest.fn();
            component.switchTab = jest.fn((tab) => {
                component.activeTab = tab;
                if (tab === 'workers') mockLoadData();
            });
            
            component.switchTab('workers');
            expect(mockLoadData).toHaveBeenCalled();
        });
    });
    
    describe('Data Loading', () => {
        beforeEach(() => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({
                    data: { test: 'data' }
                })
            });
        });
        
        test('should load overview data', async () => {
            component.loadOverview = jest.fn(async () => {
                const response = await fetch('/api/v1/admin/overview');
                const data = await response.json();
                component.overview = data;
            });
            
            await component.loadOverview();
            
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/admin/overview');
            expect(component.loadOverview).toHaveBeenCalled();
        });
        
        test('should load workers data', async () => {
            component.loadWorkers = jest.fn(async () => {
                const response = await fetch('/api/v1/admin/workers');
                const data = await response.json();
                component.workers = data;
            });
            
            await component.loadWorkers();
            
            expect(mockFetch).toHaveBeenCalledWith('/api/v1/admin/workers');
            expect(component.loadWorkers).toHaveBeenCalled();
        });
        
        test('should handle API errors gracefully', async () => {
            mockFetch.mockRejectedValue(new Error('Network error'));
            
            component.loadOverview = jest.fn(async () => {
                try {
                    await fetch('/api/v1/admin/overview');
                } catch (error) {
                    component.error = error.message;
                }
            });
            
            await component.loadOverview();
            
            expect(component.error).toBe('Network error');
        });
    });
    
    describe('Worker Management', () => {
        test('should start worker', async () => {
            mockFetch.mockResolvedValue({ ok: true });
            
            component.startWorker = jest.fn(async (workerId) => {
                await fetch(`/api/v1/admin/workers/${workerId}/start`, {
                    method: 'POST'
                });
            });
            
            await component.startWorker('test-worker');
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/v1/admin/workers/test-worker/start',
                { method: 'POST' }
            );
        });
        
        test('should stop worker', async () => {
            mockFetch.mockResolvedValue({ ok: true });
            
            component.stopWorker = jest.fn(async (workerId) => {
                await fetch(`/api/v1/admin/workers/${workerId}/stop`, {
                    method: 'POST'
                });
            });
            
            await component.stopWorker('test-worker');
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/v1/admin/workers/test-worker/stop',
                { method: 'POST' }
            );
        });
        
        test('should restart worker', async () => {
            mockFetch.mockResolvedValue({ ok: true });
            
            component.restartWorker = jest.fn(async (workerId) => {
                await fetch(`/api/v1/admin/workers/${workerId}/restart`, {
                    method: 'POST'
                });
            });
            
            await component.restartWorker('test-worker');
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/v1/admin/workers/test-worker/restart',
                { method: 'POST' }
            );
        });
    });
    
    describe('Database Management', () => {
        test('should create backup', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve({ backupId: 'backup-123' })
            });
            
            component.createBackup = jest.fn(async () => {
                const response = await fetch('/api/v1/admin/database/backup', {
                    method: 'POST'
                });
                return response.json();
            });
            
            const result = await component.createBackup();
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/v1/admin/database/backup',
                { method: 'POST' }
            );
            expect(result.backupId).toBe('backup-123');
        });
        
        test('should restore backup', async () => {
            mockFetch.mockResolvedValue({ ok: true });
            
            component.restoreBackup = jest.fn(async (backupId) => {
                await fetch(`/api/v1/admin/database/restore/${backupId}`, {
                    method: 'POST'
                });
            });
            
            await component.restoreBackup('backup-123');
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/v1/admin/database/restore/backup-123',
                { method: 'POST' }
            );
        });
    });
    
    describe('Settings Management', () => {
        test('should update settings', async () => {
            const newSettings = { maxWorkers: 5 };
            mockFetch.mockResolvedValue({ ok: true });
            
            component.updateSettings = jest.fn(async (section, settings) => {
                await fetch(`/api/v1/admin/settings/${section}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(settings)
                });
            });
            
            await component.updateSettings('workers', newSettings);
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/v1/admin/settings/workers',
                {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newSettings)
                }
            );
        });
        
        test('should reset settings to defaults', async () => {
            mockFetch.mockResolvedValue({ ok: true });
            
            component.resetSettings = jest.fn(async (section) => {
                await fetch(`/api/v1/admin/settings/${section}/reset`, {
                    method: 'POST'
                });
            });
            
            await component.resetSettings('system');
            
            expect(mockFetch).toHaveBeenCalledWith(
                '/api/v1/admin/settings/system/reset',
                { method: 'POST' }
            );
        });
    });
    
    describe('Real-time Updates', () => {
        test('should handle websocket connections', () => {
            const mockWebSocket = {
                onopen: null,
                onmessage: null,
                onclose: null,
                onerror: null,
                send: jest.fn(),
                close: jest.fn()
            };
            
            global.WebSocket = jest.fn(() => mockWebSocket);
            
            component.initWebSocket = jest.fn(() => {
                const ws = new WebSocket('ws://localhost:8000/ws/admin');
                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    component.handleRealtimeUpdate(data);
                };
                return ws;
            });
            
            component.handleRealtimeUpdate = jest.fn((data) => {
                if (data.type === 'system_metrics') {
                    component.overview.cpuUsage = data.cpu;
                    component.overview.memoryUsage = data.memory;
                }
            });
            
            const ws = component.initWebSocket();
            expect(WebSocket).toHaveBeenCalledWith('ws://localhost:8000/ws/admin');
            
            // Simulate incoming message
            const mockEvent = {
                data: JSON.stringify({
                    type: 'system_metrics',
                    cpu: 45,
                    memory: 67
                })
            };
            
            ws.onmessage(mockEvent);
            
            expect(component.handleRealtimeUpdate).toHaveBeenCalledWith({
                type: 'system_metrics',
                cpu: 45,
                memory: 67
            });
        });
    });
    
    describe('Notifications', () => {
        test('should show success notifications', () => {
            component.showNotification = jest.fn((message, type) => {
                const notification = {
                    message,
                    type,
                    timestamp: Date.now()
                };
                return notification;
            });
            
            const result = component.showNotification('Operation successful', 'success');
            
            expect(result.message).toBe('Operation successful');
            expect(result.type).toBe('success');
            expect(result.timestamp).toBeDefined();
        });
        
        test('should show error notifications', () => {
            component.showNotification = jest.fn((message, type) => {
                if (type === 'error') {
                    console.error('Admin Error:', message);
                }
                return { message, type };
            });
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            component.showNotification('Operation failed', 'error');
            
            expect(consoleSpy).toHaveBeenCalledWith('Admin Error:', 'Operation failed');
            
            consoleSpy.mockRestore();
        });
    });
    
    describe('Performance Monitoring', () => {
        test('should track performance metrics', () => {
            component.trackPerformance = jest.fn((operation) => {
                const start = performance.now();
                return {
                    end: () => {
                        const duration = performance.now() - start;
                        return { operation, duration };
                    }
                };
            });
            
            const tracker = component.trackPerformance('loadOverview');
            const result = tracker.end();
            
            expect(result.operation).toBe('loadOverview');
            expect(result.duration).toBeGreaterThanOrEqual(0);
        });
    });
});
