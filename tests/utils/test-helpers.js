/**
 * Test Utilities for Frontend Components
 * Shared utilities, mocks, and helpers for testing
 */

/**
 * Mock Alpine.js for unit testing
 */
export const createAlpineMock = () => {
    const alpineMock = {
        data: jest.fn((fn) => fn()),
        reactive: jest.fn((obj) => obj),
        store: jest.fn(),
        
        // Mock Alpine magic properties
        $data: jest.fn(),
        $el: jest.fn(() => document.createElement('div')),
        $refs: jest.fn(() => ({})),
        $watch: jest.fn(),
        $dispatch: jest.fn(),
        $nextTick: jest.fn((fn) => Promise.resolve().then(fn)),
        
        // Mock Alpine directives
        directive: jest.fn(),
        magic: jest.fn(),
        plugin: jest.fn()
    };
    
    global.Alpine = alpineMock;
    return alpineMock;
};

/**
 * Mock HTMX for unit testing
 */
export const createHTMXMock = () => {
    const htmxMock = {
        ajax: jest.fn(() => Promise.resolve()),
        trigger: jest.fn(),
        swap: jest.fn(),
        settle: jest.fn(),
        process: jest.fn(),
        find: jest.fn(),
        findAll: jest.fn(),
        closest: jest.fn(),
        values: jest.fn(() => ({})),
        
        // HTMX configuration
        config: {
            timeout: 5000,
            historyEnabled: true
        },
        
        // Event methods
        on: jest.fn(),
        off: jest.fn(),
        onLoad: jest.fn()
    };
    
    global.htmx = htmxMock;
    return htmxMock;
};

/**
 * Mock Chart.js for unit testing
 */
export const createChartMock = () => {
    const chartInstanceMock = {
        update: jest.fn(),
        destroy: jest.fn(),
        resize: jest.fn(),
        reset: jest.fn(),
        render: jest.fn(),
        stop: jest.fn(),
        clear: jest.fn(),
        toBase64Image: jest.fn(() => 'data:image/png;base64,mock'),
        
        data: {
            labels: [],
            datasets: []
        },
        
        options: {},
        
        // Chart scales
        scales: {
            x: { min: 0, max: 100 },
            y: { min: 0, max: 100 }
        }
    };
    
    const chartMock = jest.fn(() => chartInstanceMock);
    
    // Static methods
    chartMock.register = jest.fn();
    chartMock.unregister = jest.fn();
    chartMock.getChart = jest.fn(() => chartInstanceMock);
    chartMock.defaults = {
        font: { family: 'Arial' },
        color: '#666'
    };
    
    global.Chart = chartMock;
    return { chartMock, chartInstanceMock };
};

/**
 * Mock WebSocket for unit testing
 */
export const createWebSocketMock = () => {
    const webSocketMock = jest.fn(() => ({
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
        
        // WebSocket state
        readyState: WebSocket.OPEN,
        url: 'ws://localhost:8000/test',
        protocol: '',
        
        // Event handlers
        onopen: null,
        onclose: null,
        onmessage: null,
        onerror: null,
        
        // Mock constants
        CONNECTING: 0,
        OPEN: 1,
        CLOSING: 2,
        CLOSED: 3
    }));
    
    // Add static constants
    webSocketMock.CONNECTING = 0;
    webSocketMock.OPEN = 1;
    webSocketMock.CLOSING = 2;
    webSocketMock.CLOSED = 3;
    
    global.WebSocket = webSocketMock;
    return webSocketMock;
};

/**
 * Mock Notification API for unit testing
 */
export const createNotificationMock = () => {
    const notificationMock = jest.fn((title, options) => ({
        title,
        body: options?.body || '',
        icon: options?.icon || '',
        tag: options?.tag || '',
        close: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn()
    }));
    
    notificationMock.permission = 'granted';
    notificationMock.requestPermission = jest.fn(() => Promise.resolve('granted'));
    
    global.Notification = notificationMock;
    return notificationMock;
};

/**
 * Mock IntersectionObserver for lazy loading tests
 */
export const createIntersectionObserverMock = () => {
    const intersectionObserverMock = jest.fn((callback, options) => {
        const instance = {
            observe: jest.fn(),
            unobserve: jest.fn(),
            disconnect: jest.fn(),
            root: options?.root || null,
            rootMargin: options?.rootMargin || '0px',
            thresholds: options?.threshold || [0]
        };
        
        // Mock intersection event
        instance.triggerIntersection = (entries) => {
            callback(entries, instance);
        };
        
        return instance;
    });
    
    global.IntersectionObserver = intersectionObserverMock;
    return intersectionObserverMock;
};

/**
 * Mock File API for upload tests
 */
export const createFileMock = (name = 'test.txt', content = 'test content', type = 'text/plain') => {
    const fileMock = {
        name,
        size: content.length,
        type,
        lastModified: Date.now(),
        
        // File methods
        arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(content.length))),
        text: jest.fn(() => Promise.resolve(content)),
        stream: jest.fn(),
        slice: jest.fn()
    };
    
    return fileMock;
};

/**
 * Mock FileReader for file processing tests
 */
export const createFileReaderMock = () => {
    const fileReaderMock = jest.fn(() => ({
        readAsText: jest.fn(),
        readAsDataURL: jest.fn(),
        readAsArrayBuffer: jest.fn(),
        readAsBinaryString: jest.fn(),
        abort: jest.fn(),
        
        // FileReader state
        EMPTY: 0,
        LOADING: 1,
        DONE: 2,
        readyState: 0,
        result: null,
        error: null,
        
        // Event handlers
        onload: null,
        onerror: null,
        onprogress: null,
        onabort: null,
        onloadstart: null,
        onloadend: null,
        
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn()
    }));
    
    global.FileReader = fileReaderMock;
    return fileReaderMock;
};

/**
 * Create mock DOM elements with Alpine.js attributes
 */
export const createMockElement = (tagName = 'div', attributes = {}) => {
    const element = document.createElement(tagName);
    
    Object.entries(attributes).forEach(([key, value]) => {
        element.setAttribute(key, value);
    });
    
    // Add Alpine.js specific methods
    element._x_dataStack = [];
    element._x_bindings = {};
    
    return element;
};

/**
 * Mock fetch API with customizable responses
 */
export const createFetchMock = (defaultResponse = {}) => {
    const fetchMock = jest.fn((url, options) => {
        const response = {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Map(),
            url,
            
            json: jest.fn(() => Promise.resolve(defaultResponse)),
            text: jest.fn(() => Promise.resolve(JSON.stringify(defaultResponse))),
            blob: jest.fn(() => Promise.resolve(new Blob([JSON.stringify(defaultResponse)]))),
            arrayBuffer: jest.fn(() => Promise.resolve(new ArrayBuffer(8))),
            
            clone: jest.fn(() => response)
        };
        
        // Add headers methods
        response.headers.get = jest.fn((name) => {
            const headers = {
                'content-type': 'application/json',
                'cache-control': 'max-age=3600'
            };
            return headers[name.toLowerCase()];
        });
        
        return Promise.resolve(response);
    });
    
    // Add mock configurations for specific URLs
    fetchMock.mockResponseFor = (url, response) => {
        fetchMock.mockImplementation((requestUrl, options) => {
            if (requestUrl.includes(url)) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve(response),
                    text: () => Promise.resolve(JSON.stringify(response))
                });
            }
            return fetchMock(requestUrl, options);
        });
    };
    
    fetchMock.mockErrorFor = (url, error) => {
        fetchMock.mockImplementation((requestUrl, options) => {
            if (requestUrl.includes(url)) {
                return Promise.reject(error);
            }
            return fetchMock(requestUrl, options);
        });
    };
    
    global.fetch = fetchMock;
    return fetchMock;
};

/**
 * Mock local storage for testing
 */
export const createLocalStorageMock = () => {
    const storage = {};
    
    const localStorageMock = {
        getItem: jest.fn((key) => storage[key] || null),
        setItem: jest.fn((key, value) => {
            storage[key] = String(value);
        }),
        removeItem: jest.fn((key) => {
            delete storage[key];
        }),
        clear: jest.fn(() => {
            Object.keys(storage).forEach(key => delete storage[key]);
        }),
        key: jest.fn((index) => Object.keys(storage)[index] || null),
        get length() {
            return Object.keys(storage).length;
        }
    };
    
    global.localStorage = localStorageMock;
    global.sessionStorage = localStorageMock; // Use same mock for sessionStorage
    
    return localStorageMock;
};

/**
 * Mock performance API for testing
 */
export const createPerformanceMock = () => {
    const performanceMock = {
        now: jest.fn(() => Date.now()),
        mark: jest.fn(),
        measure: jest.fn(),
        getEntriesByType: jest.fn((type) => {
            const mockEntries = {
                navigation: [{
                    domContentLoadedEventEnd: 1000,
                    domContentLoadedEventStart: 950,
                    loadEventEnd: 1200,
                    loadEventStart: 1150,
                    responseStart: 100,
                    requestStart: 50,
                    domInteractive: 800,
                    fetchStart: 0
                }],
                resource: [
                    {
                        name: 'http://localhost/app.js',
                        transferSize: 50000,
                        duration: 200
                    },
                    {
                        name: 'http://localhost/style.css',
                        transferSize: 10000,
                        duration: 50
                    }
                ],
                fetch: [
                    {
                        name: 'http://localhost/api/loras',
                        duration: 300
                    }
                ]
            };
            
            return mockEntries[type] || [];
        }),
        getEntriesByName: jest.fn(),
        clearMarks: jest.fn(),
        clearMeasures: jest.fn(),
        
        // Mock memory info (Chrome specific)
        memory: {
            usedJSHeapSize: 10000000,
            totalJSHeapSize: 15000000,
            jsHeapSizeLimit: 100000000
        }
    };
    
    global.performance = performanceMock;
    return performanceMock;
};

/**
 * Test data factories
 */
export const testDataFactory = {
    createLoRA: (overrides = {}) => ({
        id: 'test-lora-1',
        name: 'Test LoRA',
        path: '/test/path/lora.safetensors',
        metadata: {
            type: 'character',
            tags: ['test', 'character'],
            description: 'Test LoRA for testing',
            version: '1.0.0',
            author: 'Test Author',
            ...overrides.metadata
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        ...overrides
    }),
    
    createUser: (overrides = {}) => ({
        id: 'test-user-1',
        preferences: {
            favorite_tags: ['anime', 'character'],
            blacklisted_tags: ['nsfw'],
            theme: 'dark',
            ...overrides.preferences
        },
        created_at: '2024-01-01T00:00:00Z',
        ...overrides
    }),
    
    createRecommendation: (overrides = {}) => ({
        lora_id: 'test-lora-1',
        score: 0.85,
        reason: 'matches_preferences',
        timestamp: '2024-01-01T00:00:00Z',
        ...overrides
    }),
    
    createMetric: (overrides = {}) => ({
        timestamp: '2024-01-01T00:00:00Z',
        metric_type: 'cpu_usage',
        value: 45.5,
        tags: { source: 'system' },
        ...overrides
    }),
    
    createAnalyticsData: (overrides = {}) => ({
        kpis: {
            totalRequests: 1000,
            avgResponseTime: 250,
            errorRate: 0.5,
            uptime: 99.9,
            ...overrides.kpis
        },
        systemMetrics: {
            cpu: [
                { timestamp: '2024-01-01T10:00:00Z', value: 45 },
                { timestamp: '2024-01-01T11:00:00Z', value: 52 }
            ],
            memory: [
                { timestamp: '2024-01-01T10:00:00Z', value: 67 },
                { timestamp: '2024-01-01T11:00:00Z', value: 72 }
            ],
            ...overrides.systemMetrics
        },
        ...overrides
    })
};

/**
 * Component testing utilities
 */
export const componentTestUtils = {
    /**
     * Simulate Alpine.js component initialization
     */
    initAlpineComponent: (element, data) => {
        element._x_dataStack = [data];
        element._x_bindings = {};
        
        // Simulate Alpine's reactive system
        Object.keys(data).forEach(key => {
            Object.defineProperty(element, key, {
                get: () => data[key],
                set: (value) => {
                    data[key] = value;
                    // Trigger reactivity
                    element.dispatchEvent(new CustomEvent('alpine:data-changed', {
                        detail: { key, value }
                    }));
                }
            });
        });
        
        return element;
    },
    
    /**
     * Simulate HTMX request
     */
    simulateHTMXRequest: (element, url, method = 'GET', data = null) => {
        const event = new CustomEvent('htmx:beforeRequest', {
            detail: {
                xhr: {
                    open: jest.fn(),
                    send: jest.fn(),
                    setRequestHeader: jest.fn()
                },
                target: element,
                requestConfig: {
                    url,
                    verb: method,
                    parameters: data
                }
            }
        });
        
        element.dispatchEvent(event);
        
        // Simulate response
        setTimeout(() => {
            const responseEvent = new CustomEvent('htmx:afterRequest', {
                detail: {
                    xhr: {
                        status: 200,
                        responseText: JSON.stringify({ success: true })
                    },
                    target: element
                }
            });
            element.dispatchEvent(responseEvent);
        }, 0);
        
        return event;
    },
    
    /**
     * Wait for async operations to complete
     */
    waitForAsync: () => new Promise(resolve => setTimeout(resolve, 0)),
    
    /**
     * Simulate user interaction events
     */
    simulateClick: (element) => {
        const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(event);
        return event;
    },
    
    simulateInput: (element, value) => {
        element.value = value;
        const event = new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            data: value
        });
        element.dispatchEvent(event);
        return event;
    },
    
    simulateSubmit: (form) => {
        const event = new SubmitEvent('submit', {
            bubbles: true,
            cancelable: true
        });
        form.dispatchEvent(event);
        return event;
    }
};

/**
 * Assertion helpers
 */
export const assertionHelpers = {
    /**
     * Assert that element has Alpine.js data
     */
    expectAlpineData: (element, expectedData) => {
        expect(element._x_dataStack).toBeDefined();
        expect(element._x_dataStack[0]).toMatchObject(expectedData);
    },
    
    /**
     * Assert that Chart.js chart was created correctly
     */
    expectChartCreated: (chartMock, expectedType, expectedData) => {
        expect(chartMock).toHaveBeenCalled();
        const chartConfig = chartMock.mock.calls[0][1];
        expect(chartConfig.type).toBe(expectedType);
        expect(chartConfig.data).toMatchObject(expectedData);
    },
    
    /**
     * Assert that fetch was called with correct parameters
     */
    expectFetchCalled: (fetchMock, expectedUrl, expectedOptions = {}) => {
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining(expectedUrl),
            expect.objectContaining(expectedOptions)
        );
    },
    
    /**
     * Assert that WebSocket connection was established
     */
    expectWebSocketConnected: (webSocketMock, expectedUrl) => {
        expect(webSocketMock).toHaveBeenCalledWith(expectedUrl);
    },
    
    /**
     * Assert that notification was shown
     */
    expectNotificationShown: (notificationMock, expectedTitle, expectedOptions = {}) => {
        expect(notificationMock).toHaveBeenCalledWith(
            expectedTitle,
            expect.objectContaining(expectedOptions)
        );
    }
};

/**
 * Setup function for common test environment
 */
export const setupTestEnvironment = () => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Setup DOM
    document.body.innerHTML = '';
    
    // Setup mocks
    const mocks = {
        alpine: createAlpineMock(),
        htmx: createHTMXMock(),
        chart: createChartMock(),
        webSocket: createWebSocketMock(),
        notification: createNotificationMock(),
        intersectionObserver: createIntersectionObserverMock(),
        fetch: createFetchMock(),
        localStorage: createLocalStorageMock(),
        performance: createPerformanceMock()
    };
    
    return mocks;
};

/**
 * Cleanup function for test environment
 */
export const cleanupTestEnvironment = () => {
    // Clear DOM
    document.body.innerHTML = '';
    
    // Clear global mocks
    delete global.Alpine;
    delete global.htmx;
    delete global.Chart;
    delete global.WebSocket;
    delete global.Notification;
    delete global.IntersectionObserver;
    delete global.fetch;
    delete global.localStorage;
    delete global.sessionStorage;
    delete global.performance;
    
    // Clear all timers
    jest.clearAllTimers();
    jest.clearAllMocks();
};
