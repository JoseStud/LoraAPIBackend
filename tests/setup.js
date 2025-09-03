/**
 * Jest Test Setup
 * Global test configuration and utilities
 */

require('@testing-library/jest-dom');

// Import API mocks for integration tests
require('./mocks/api-mocks');

// Mock Canvas for Chart.js
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    getImageData: jest.fn(() => ({
        data: new Array(4)
    })),
    putImageData: jest.fn(),
    createImageData: jest.fn(() => []),
    setTransform: jest.fn(),
    drawImage: jest.fn(),
    save: jest.fn(),
    fillText: jest.fn(),
    restore: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    stroke: jest.fn(),
    translate: jest.fn(),
    scale: jest.fn(),
    rotate: jest.fn(),
    arc: jest.fn(),
    fill: jest.fn(),
    measureText: jest.fn(() => ({ width: 0 })),
    transform: jest.fn(),
    rect: jest.fn(),
    clip: jest.fn()
}));

HTMLCanvasElement.prototype.toDataURL = jest.fn(() => 'data:image/png;base64,mock');
HTMLCanvasElement.prototype.getBoundingClientRect = jest.fn(() => ({
    width: 300,
    height: 150,
    top: 0,
    left: 0,
    bottom: 150,
    right: 300
}));

// Mock Alpine.js for testing
global.Alpine = {
    data: jest.fn(),
    store: jest.fn(),
    start: jest.fn(),
    $data: jest.fn(),
    version: '3.13.3'
};

// Mock HTMX for testing
global.htmx = {
    process: jest.fn(),
    ajax: jest.fn(),
    trigger: jest.fn(),
    remove: jest.fn(),
    addClass: jest.fn(),
    removeClass: jest.fn(),
    find: jest.fn()
};

// Mock Chart.js for testing
global.Chart = {
    register: jest.fn(),
    getChart: jest.fn(),
    defaults: {
        responsive: true,
        maintainAspectRatio: false
    }
};

// Mock service worker for PWA tests
global.navigator.serviceWorker = {
    register: jest.fn(() => Promise.resolve({
        installing: null,
        waiting: null,
        active: {
            postMessage: jest.fn()
        },
        addEventListener: jest.fn(),
        update: jest.fn(() => Promise.resolve())
    })),
    ready: Promise.resolve({
        installing: null,
        waiting: null,
        active: {
            postMessage: jest.fn()
        }
    }),
    controller: null,
    addEventListener: jest.fn()
};

// Mock online/offline status
Object.defineProperty(global.navigator, 'onLine', {
    writable: true,
    value: true
});

// Mock vibration API
global.navigator.vibrate = jest.fn();

// Mock intersection observer
global.IntersectionObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
}));

// Mock resize observer
global.ResizeObserver = jest.fn(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
}));

// Mock fetch for API tests
global.fetch = jest.fn();

// Mock local storage
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};
global.localStorage = localStorageMock;

// Mock session storage
const sessionStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
};
global.sessionStorage = sessionStorageMock;

// Mock window.matchMedia
global.matchMedia = jest.fn((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn()
}));

// Mock window.crypto for encryption tests
global.crypto = {
    getRandomValues: jest.fn((arr) => {
        for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
        }
        return arr;
    }),
    subtle: {
        encrypt: jest.fn(),
        decrypt: jest.fn(),
        generateKey: jest.fn(),
        importKey: jest.fn(),
        exportKey: jest.fn()
    }
};

// Test utilities
global.testUtils = {
    // Create mock DOM element
    createMockElement: (tag = 'div', attributes = {}) => {
        const element = document.createElement(tag);
        Object.entries(attributes).forEach(([key, value]) => {
            element.setAttribute(key, value);
        });
        return element;
    },
    
    // Create mock Alpine component
    createMockAlpineComponent: (data = {}) => {
        return {
            ...data,
            $el: global.testUtils.createMockElement(),
            $watch: jest.fn(),
            $nextTick: jest.fn((callback) => Promise.resolve().then(callback)),
            $dispatch: jest.fn()
        };
    },
    
    // Simulate user event
    simulateEvent: (element, eventType, eventData = {}) => {
        const event = new Event(eventType, { bubbles: true });
        Object.assign(event, eventData);
        element.dispatchEvent(event);
        return event;
    },
    
    // Wait for async operations
    waitFor: (condition, timeout = 5000) => {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const check = () => {
                if (condition()) {
                    resolve();
                } else if (Date.now() - startTime > timeout) {
                    reject(new Error('Timeout waiting for condition'));
                } else {
                    setTimeout(check, 10);
                }
            };
            check();
        });
    },
    
    // Mock API response
    mockAPIResponse: (data, status = 200) => {
        return Promise.resolve({
            ok: status >= 200 && status < 300,
            status,
            json: () => Promise.resolve(data),
            text: () => Promise.resolve(JSON.stringify(data)),
            headers: new Headers()
        });
    },
    
    // Create test data
    createTestLoRA: (overrides = {}) => ({
        id: 'test-lora-1',
        name: 'Test LoRA',
        description: 'A test LoRA model',
        file_path: '/test/path/model.safetensors',
        file_size: 1024000,
        model_type: 'character',
        tags: ['test', 'character'],
        rating: 4.5,
        downloads: 1000,
        created_at: '2025-09-01T00:00:00Z',
        updated_at: '2025-09-03T00:00:00Z',
        ...overrides
    }),
    
    createTestGeneration: (overrides = {}) => ({
        id: 'test-gen-1',
        prompt: 'test prompt',
        negative_prompt: 'test negative',
        seed: 12345,
        steps: 20,
        cfg_scale: 7.5,
        width: 512,
        height: 512,
        sampler: 'DPM++ 2M Karras',
        loras: ['test-lora-1'],
        status: 'completed',
        created_at: '2025-09-03T00:00:00Z',
        completed_at: '2025-09-03T00:01:00Z',
        output_path: '/test/output/image.png',
        ...overrides
    })
};

// Console suppress for tests
const originalError = console.error;
beforeAll(() => {
    console.error = (...args) => {
        if (
            typeof args[0] === 'string' &&
            args[0].includes('Warning: ReactDOM.render is no longer supported')
        ) {
            return;
        }
        originalError.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalError;
});

// Clean up after each test
afterEach(() => {
    jest.clearAllMocks();
    document.body.innerHTML = '';
    localStorage.clear();
    sessionStorage.clear();
});

// Global test timeout
jest.setTimeout(10000);
