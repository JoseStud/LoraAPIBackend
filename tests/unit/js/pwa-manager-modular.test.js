/**
 * Test suite for PWA Manager modular components
 */

// Mock modules
global.localStorage = mockLocalStorage;

// Load PWA Manager modules using require for Node.js environment
const { pwaServiceWorker } = require('../../../app/frontend/static/js/components/pwa-manager/service-worker.js');
const { pwaInstallation } = require('../../../app/frontend/static/js/components/pwa-manager/installation.js');
const { pwaOffline } = require('../../../app/frontend/static/js/components/pwa-manager/offline.js');
const { pwaCache } = require('../../../app/frontend/static/js/components/pwa-manager/cache.js');
const { pwaUI } = require('../../../app/frontend/static/js/components/pwa-manager/ui.js');
const { PWAManager } = require('../../../app/frontend/static/js/components/pwa-manager/index.js');

describe('PWA Manager Modular Components', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue(null);
        
        // Set up modules on global window for tests
        global.window.pwaServiceWorker = pwaServiceWorker;
        global.window.pwaInstallation = pwaInstallation;
        global.window.pwaOffline = pwaOffline;
        global.window.pwaCache = pwaCache;
        global.window.pwaUI = pwaUI;
        global.window.PWAManager = PWAManager;
    });
    
    afterEach(() => {
        // Cleanup globals
        delete global.window.pwaServiceWorker;
        delete global.window.pwaInstallation;
        delete global.window.pwaOffline;
        delete global.window.pwaCache;
        delete global.window.pwaUI;
        delete global.window.PWAManager;
    });

global.document = {
    querySelector: jest.fn(),
    createElement: jest.fn(() => ({
        className: '',
        innerHTML: '',
        classList: {
            add: jest.fn(),
            remove: jest.fn(),
            toggle: jest.fn()
        },
        addEventListener: jest.fn(),
        remove: jest.fn(),
        querySelector: jest.fn(),
        appendChild: jest.fn()
    })),
    body: {
        appendChild: jest.fn(),
        classList: {
            toggle: jest.fn()
        }
    },
    documentElement: {
        style: {
            setProperty: jest.fn()
        }
    },
    addEventListener: jest.fn(),
    hidden: false
};

// Mock localStorage
const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};
global.localStorage = mockLocalStorage;

// Load modules
require('../../../app/frontend/static/js/components/pwa-manager/service-worker.js');
require('../../../app/frontend/static/js/components/pwa-manager/installation.js');
require('../../../app/frontend/static/js/components/pwa-manager/offline.js');
require('../../../app/frontend/static/js/components/pwa-manager/cache.js');
require('../../../app/frontend/static/js/components/pwa-manager/ui.js');
require('../../../app/frontend/static/js/components/pwa-manager/index.js');

describe('PWA Manager Modular Components', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockLocalStorage.getItem.mockReturnValue(null);
    });

    describe('Service Worker Module', () => {
        test('should register service worker successfully', async () => {
            const mockRegistration = { scope: '/', active: true };
            global.window.navigator.serviceWorker.register.mockResolvedValue(mockRegistration);
            
            const registration = await global.window.pwaServiceWorker.register();
            
            expect(registration).toBe(mockRegistration);
            expect(global.window.navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
        });
        
        test('should handle service worker registration failure', async () => {
            global.window.navigator.serviceWorker.register.mockRejectedValue(new Error('Registration failed'));
            
            await expect(global.window.pwaServiceWorker.register()).rejects.toThrow('Service Worker registration failed');
        });
        
        test('should check service worker support', () => {
            const supported = global.window.pwaServiceWorker.isSupported();
            expect(supported).toBe(true);
        });
        
        test('should get service worker capabilities', () => {
            const capabilities = global.window.pwaServiceWorker.getCapabilities();
            
            expect(capabilities).toHaveProperty('serviceWorker');
            expect(capabilities).toHaveProperty('pushManager');
            expect(capabilities).toHaveProperty('notification');
        });
        
        test('should setup event listeners with cleanup', () => {
            const mockRegistration = {
                addEventListener: jest.fn(),
                removeEventListener: jest.fn()
            };
            
            const cleanup = global.window.pwaServiceWorker.setupEventListeners(mockRegistration);
            
            expect(mockRegistration.addEventListener).toHaveBeenCalled();
            expect(typeof cleanup).toBe('function');
            
            cleanup();
            expect(mockRegistration.removeEventListener).toHaveBeenCalled();
        });
    });

    describe('Installation Module', () => {
        test('should check installation status', () => {
            const status = global.window.pwaInstallation.checkInstallationStatus();
            
            expect(status).toHaveProperty('isInstalled');
            expect(status).toHaveProperty('standalone');
            expect(typeof status.isInstalled).toBe('boolean');
        });
        
        test('should detect install support', () => {
            const support = global.window.pwaInstallation.isInstallSupported();
            
            expect(support).toHaveProperty('beforeInstallPrompt');
            expect(support).toHaveProperty('appleWebApp');
            expect(support).toHaveProperty('androidWebApp');
        });
        
        test('should get install criteria', () => {
            const criteria = global.window.pwaInstallation.getInstallCriteria();
            
            expect(criteria).toHaveProperty('isHTTPS');
            expect(criteria).toHaveProperty('hasManifest');
            expect(criteria).toHaveProperty('hasServiceWorker');
        });
        
        test('should manage install dismissal', () => {
            const dismissal = global.window.pwaInstallation.manageInstallDismissal();
            
            expect(typeof dismissal.isDismissed).toBe('function');
            expect(typeof dismissal.dismiss).toBe('function');
            expect(typeof dismissal.clearDismissal).toBe('function');
        });
        
        test('should create install prompt UI', () => {
            const prompt = global.window.pwaInstallation.createInstallPrompt();
            
            expect(prompt).toBeDefined();
            expect(prompt.id).toBe('pwa-install-prompt');
        });
        
        test('should detect platform correctly', () => {
            const platform = global.window.pwaInstallation.detectPlatform();
            expect(typeof platform).toBe('string');
        });
    });

    describe('Offline Module', () => {
        test('should initialize offline state', () => {
            const state = global.window.pwaOffline.init();
            
            expect(state).toHaveProperty('isOnline');
            expect(state).toHaveProperty('queuedActions');
            expect(Array.isArray(state.queuedActions)).toBe(true);
        });
        
        test('should load and save queued actions', () => {
            const testActions = [{ id: 'test', url: '/api/test' }];
            mockLocalStorage.getItem.mockReturnValue(JSON.stringify(testActions));
            
            const actions = global.window.pwaOffline.loadQueuedActions();
            expect(actions).toEqual(testActions);
            
            const saved = global.window.pwaOffline.saveQueuedActions(actions);
            expect(saved).toBe(true);
            expect(mockLocalStorage.setItem).toHaveBeenCalled();
        });
        
        test('should queue actions correctly', () => {
            const action = { url: '/api/test', type: 'fetch' };
            const state = { queuedActions: [] };
            
            const queuedAction = global.window.pwaOffline.queueAction(action, state);
            
            expect(queuedAction).toHaveProperty('id');
            expect(queuedAction).toHaveProperty('timestamp');
            expect(state.queuedActions).toHaveLength(1);
        });
        
        test('should create offline indicator', () => {
            const indicator = global.window.pwaOffline.createOfflineIndicator();
            
            expect(indicator).toBeDefined();
            expect(indicator.id).toBe('offline-indicator');
        });
        
        test('should get offline status', () => {
            const state = { isOnline: true, queuedActions: [] };
            const status = global.window.pwaOffline.getOfflineStatus(state);
            
            expect(status).toHaveProperty('isOnline');
            expect(status).toHaveProperty('queuedActionsCount');
        });
        
        test('should generate unique action IDs', () => {
            const id1 = global.window.pwaOffline.generateActionId();
            const id2 = global.window.pwaOffline.generateActionId();
            
            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^action_\d+_/);
        });
    });

    describe('Cache Module', () => {
        test('should format cache sizes correctly', () => {
            expect(global.window.pwaCache.formatCacheSize(0)).toBe('0 Bytes');
            expect(global.window.pwaCache.formatCacheSize(1024)).toBe('1 KB');
            expect(global.window.pwaCache.formatCacheSize(1048576)).toBe('1 MB');
        });
        
        test('should calculate cache health score', () => {
            const stats = { hitRate: 80, totalRequests: 100 };
            const storageInfo = { percent: 50, isPersistent: true };
            
            const health = global.window.pwaCache.calculateCacheHealth(stats, storageInfo);
            
            expect(typeof health).toBe('number');
            expect(health).toBeGreaterThanOrEqual(0);
            expect(health).toBeLessThanOrEqual(100);
        });
        
        test('should generate cache recommendations', () => {
            const stats = { hitRate: 30, totalRequests: 100 };
            const storageInfo = { percent: 90, isPersistent: false };
            
            const recommendations = global.window.pwaCache.generateCacheRecommendations(stats, storageInfo);
            
            expect(Array.isArray(recommendations)).toBe(true);
            expect(recommendations.length).toBeGreaterThan(0);
            expect(recommendations[0]).toHaveProperty('type');
            expect(recommendations[0]).toHaveProperty('message');
        });
        
        test('should get critical resources list', () => {
            const resources = global.window.pwaCache.getCriticalResources();
            
            expect(Array.isArray(resources)).toBe(true);
            expect(resources.length).toBeGreaterThan(0);
            expect(resources).toContain('/');
        });
        
        test('should handle cache operations with registration', async () => {
            const mockRegistration = {
                active: {
                    postMessage: jest.fn()
                }
            };
            
            // Should throw without registration
            await expect(global.window.pwaCache.getCacheStatus(null)).rejects.toThrow();
            
            // Should not throw with registration (though will timeout in test)
            const statusPromise = global.window.pwaCache.getCacheStatus(mockRegistration);
            expect(statusPromise).toBeInstanceOf(Promise);
        });
    });

    describe('UI Module', () => {
        test('should get responsive configuration', () => {
            global.window.innerWidth = 320; // Mobile
            
            const config = global.window.pwaUI.getResponsiveConfig();
            
            expect(config).toHaveProperty('isMobile');
            expect(config).toHaveProperty('isTablet');
            expect(config).toHaveProperty('isDesktop');
            expect(config.isMobile).toBe(true);
        });
        
        test('should create notification element', () => {
            const notification = global.window.pwaUI.createNotificationElement(
                'Test Title',
                'Test Message',
                'info',
                'test-class',
                true
            );
            
            expect(notification).toBeDefined();
            expect(notification.className).toContain('test-class');
        });
        
        test('should get notification icons', () => {
            const successIcon = global.window.pwaUI.getNotificationIcon('success');
            const errorIcon = global.window.pwaUI.getNotificationIcon('error');
            const infoIcon = global.window.pwaUI.getNotificationIcon('info');
            
            expect(successIcon).toContain('svg');
            expect(errorIcon).toContain('svg');
            expect(infoIcon).toContain('svg');
        });
        
        test('should create progress bar', () => {
            const progress = global.window.pwaUI.createProgressBar({
                value: 50,
                max: 100,
                label: 'Test Progress'
            });
            
            expect(progress).toHaveProperty('element');
            expect(progress).toHaveProperty('update');
            expect(typeof progress.update).toBe('function');
        });
        
        test('should create modal dialog', () => {
            const modal = global.window.pwaUI.createModal({
                title: 'Test Modal',
                content: 'Test Content',
                actions: [
                    { id: 'test', text: 'Test Button', handler: jest.fn() }
                ]
            });
            
            expect(modal).toBeDefined();
            expect(modal.id).toBe(undefined); // No ID set by default
        });
        
        test('should create loading indicator', () => {
            const loader = global.window.pwaUI.createLoadingIndicator({
                message: 'Loading test...',
                size: 'large'
            });
            
            expect(loader).toBeDefined();
            expect(loader.innerHTML).toContain('Loading test...');
        });
        
        test('should create notification queue', () => {
            const queue = global.window.pwaUI.createNotificationQueue(2);
            
            expect(queue).toHaveProperty('add');
            expect(queue).toHaveProperty('processQueue');
            expect(queue).toHaveProperty('clear');
            expect(typeof queue.getQueueLength).toBe('function');
        });
    });

    describe('Main PWA Manager', () => {
        test('should initialize with default options', () => {
            const manager = new global.window.PWAManager();
            
            expect(manager.options.enableLogging).toBe(true);
            expect(manager.options.autoUpdate).toBe(true);
            expect(manager.state.isInitialized).toBe(false);
        });
        
        test('should accept custom options', () => {
            const manager = new global.window.PWAManager({
                enableLogging: false,
                autoUpdate: false
            });
            
            expect(manager.options.enableLogging).toBe(false);
            expect(manager.options.autoUpdate).toBe(false);
        });
        
        test('should get status information', () => {
            const manager = new global.window.PWAManager();
            const status = manager.getStatus();
            
            expect(status).toHaveProperty('isInitialized');
            expect(status).toHaveProperty('isOnline');
            expect(status).toHaveProperty('isInstalled');
            expect(status).toHaveProperty('hasUpdate');
        });
        
        test('should handle errors correctly', () => {
            const onError = jest.fn();
            const manager = new global.window.PWAManager({
                callbacks: { onError }
            });
            
            const testError = new Error('Test error');
            manager.handleError('Test context', testError);
            
            expect(onError).toHaveBeenCalledWith(testError, 'Test context');
        });
        
        test('should log messages when enabled', () => {
            const manager = new global.window.PWAManager({ enableLogging: true });
            
            manager.log('Test message', 'info');
            
            expect(global.window.DevLogger.info).toHaveBeenCalled();
        });
        
        test('should not log when disabled', () => {
            const manager = new global.window.PWAManager({ enableLogging: false });
            
            manager.log('Test message', 'info');
            
            expect(global.window.DevLogger.info).not.toHaveBeenCalled();
        });
        
        test('should cleanup resources', () => {
            const manager = new global.window.PWAManager();
            
            // Mock cleanup functions
            manager.installCleanup = jest.fn();
            manager.swCleanup = jest.fn();
            manager.notificationQueue = { clear: jest.fn() };
            
            manager.destroy();
            
            expect(manager.installCleanup).toHaveBeenCalled();
            expect(manager.swCleanup).toHaveBeenCalled();
            expect(manager.notificationQueue.clear).toHaveBeenCalled();
            expect(manager.state.isInitialized).toBe(false);
        });
        
        test('should get analytics data', () => {
            const manager = new global.window.PWAManager();
            const analytics = manager.getAnalytics();
            
            expect(analytics).toHaveProperty('installation');
            expect(analytics).toHaveProperty('offline');
            expect(analytics).toHaveProperty('serviceWorker');
            expect(analytics).toHaveProperty('timestamp');
        });
    });

    describe('Integration Tests', () => {
        test('should work together for complete PWA functionality', () => {
            // Test that all modules are properly loaded and accessible
            expect(global.window.pwaServiceWorker).toBeDefined();
            expect(global.window.pwaInstallation).toBeDefined();
            expect(global.window.pwaOffline).toBeDefined();
            expect(global.window.pwaCache).toBeDefined();
            expect(global.window.pwaUI).toBeDefined();
            expect(global.window.PWAManager).toBeDefined();
        });
        
        test('should handle offline to online transition', () => {
            const state = global.window.pwaOffline.init();
            const action = { url: '/api/test', type: 'fetch' };
            
            // Queue action while offline
            global.window.pwaOffline.queueAction(action, state);
            expect(state.queuedActions).toHaveLength(1);
            
            // Simulate going online and syncing
            state.isOnline = true;
            const summary = global.window.pwaOffline.getQueuedActionsSummary(state);
            expect(summary.total).toBe(1);
        });
        
        test('should create and manage UI components together', () => {
            const notification = global.window.pwaUI.showNotification('Test', 'Message', 'info');
            const modal = global.window.pwaUI.showModal({
                title: 'Test',
                content: 'Content'
            });
            
            expect(notification).toHaveProperty('remove');
            expect(modal).toHaveProperty('remove');
        });
    });
});
