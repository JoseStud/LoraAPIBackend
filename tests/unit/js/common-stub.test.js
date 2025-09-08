/**
 * Jest tests for common-stub.js
 */

// Mock DevLogger for tests
global.window = {
    DevLogger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    }
};

// Import the functions we want to test
const { getCommonStub } = require('../../../app/frontend/static/js/lib/common-stub.js');
const { registerLazyComponent } = require('../../../app/frontend/static/js/lib/lazy-registration.js');

describe('Common Stub Functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getCommonStub', () => {
        test('should return an object with init method for any component name', () => {
            const stub = getCommonStub('testComponent');
            
            expect(stub).toBeInstanceOf(Object);
            expect(stub).toHaveProperty('init');
            expect(typeof stub.init).toBe('function');
        });

        test('should return empty object for empty component name', () => {
            const stub = getCommonStub('');
            
            expect(stub).toBeInstanceOf(Object);
            expect(stub).toHaveProperty('init');
        });

        test('should handle undefined component name', () => {
            const stub = getCommonStub(undefined);
            
            expect(stub).toBeInstanceOf(Object);
            expect(stub).toHaveProperty('init');
        });

        test('should return different objects for different component names', () => {
            const stub1 = getCommonStub('component1');
            const stub2 = getCommonStub('component2');
            
            expect(stub1).not.toBe(stub2);
        });

        test('init method should be callable without errors', () => {
            const stub = getCommonStub('testComponent');
            
            expect(() => {
                stub.init();
            }).not.toThrow();
        });
    });

    describe('registerLazyComponent', () => {
        // Mock global Alpine
        beforeEach(() => {
            global.window.Alpine = {
                data: jest.fn()
            };
            global.window.getCommonStub = getCommonStub;
        });

        afterEach(() => {
            delete global.window.Alpine;
        });

        test('should register component with Alpine when Alpine is available', () => {
            registerLazyComponent('testComponent');
            
            expect(global.window.Alpine.data).toHaveBeenCalledWith('testComponent', expect.any(Function));
        });

        test('should not throw when Alpine is not available', () => {
            delete global.window.Alpine;
            
            expect(() => {
                registerLazyComponent('testComponent');
            }).not.toThrow();
        });

        test('should register factory that returns valid stub', () => {
            registerLazyComponent('testComponent');
            
            // Get the factory function passed to Alpine.data
            const factoryCall = global.window.Alpine.data.mock.calls[0];
            const factory = factoryCall[1];
            
            const stub = factory();
            expect(stub).toHaveProperty('init');
            expect(typeof stub.init).toBe('function');
        });

        test('should handle component names with special characters', () => {
            const componentName = 'test-component_with.special@chars';
            
            expect(() => {
                registerLazyComponent(componentName);
            }).not.toThrow();
            
            expect(global.window.Alpine.data).toHaveBeenCalledWith(componentName, expect.any(Function));
        });
    });

    describe('Integration tests', () => {
        test('lazy component should use getCommonStub internally', () => {
            global.window.Alpine = { data: jest.fn() };
            global.window.getCommonStub = jest.fn().mockReturnValue({ init: jest.fn() });
            
            registerLazyComponent('testComponent');
            
            // Get and execute the factory
            const factory = global.window.Alpine.data.mock.calls[0][1];
            factory();
            
            expect(global.window.getCommonStub).toHaveBeenCalledWith('testComponent');
        });
    });
});
