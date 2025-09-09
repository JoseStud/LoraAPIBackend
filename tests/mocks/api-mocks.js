/**
 * API Mocks for Integration Tests
 * Provides realistic mock responses for all API endpoints
 */

// Mock fetch globally for all tests
global.fetch = jest.fn();

// Mock WebSocket
global.WebSocket = jest.fn().mockImplementation((url) => {
    return {
        close: jest.fn(),
        send: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
        readyState: 1, // OPEN
        url: url,
        onopen: null,
        onclose: null,
        onmessage: null,
        onerror: null
    };
});

// Sample data for mocking
const mockData = {
    loras: [
        {
            id: 'test-lora-1',
            name: 'Anime Character LoRA',
            description: 'High-quality anime character style',
            tags: ['anime', 'character'],
            type: 'character',
            file_size: 1024000,
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
        },
        {
            id: 'test-lora-2',
            name: 'Landscape LoRA',
            description: 'Beautiful landscape generation',
            tags: ['landscape', 'nature'],
            type: 'style',
            file_size: 2048000,
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z'
        }
    ],
    recommendations: [
        {
            id: 'rec-1',
            lora_id: 'test-lora-1',
            score: 0.95,
            reason: 'Based on your usage patterns'
        }
    ],
    analytics: {
        kpis: {
            total_loras: 42,
            active_users: 15,
            average_response_time: 250,
            uptime_percentage: 99.5,
            error_rate: 0.01
        },
        usage_stats: {
            downloads_today: 125,
            uploads_today: 8,
            api_calls_today: 1500
        },
        performance_metrics: [
            { timestamp: '2024-01-01T00:00:00Z', response_time: 245, memory_usage: 75.2 },
            { timestamp: '2024-01-01T01:00:00Z', response_time: 260, memory_usage: 78.1 }
        ]
    },
    admin: {
        overview: {
            systemInfo: {
                version: '2.1.0',
                uptime: '7 days, 12 hours',
                memory_usage: '2.1 GB',
                cpu_usage: '15%',
                disk_usage: '45%'
            },
            status: 'healthy'
        },
        workers: {
            active: 3,
            idle: 1,
            failed: 0,
            workers: [
                { id: 'worker-1', status: 'active', task: 'processing_upload' },
                { id: 'worker-2', status: 'idle', task: null },
                { id: 'worker-3', status: 'active', task: 'generating_recommendations' }
            ]
        }
    }
};

// API Mock Functions
const apiMocks = {
    // LoRA Management
    'GET /api/loras': (url) => {
        const urlObj = new URL(url, 'http://localhost');
        const page = parseInt(urlObj.searchParams.get('page')) || 1;
        const limit = parseInt(urlObj.searchParams.get('limit')) || 10;
        const tags = urlObj.searchParams.get('tags');
        const type = urlObj.searchParams.get('type');
        
        let filteredLoras = [...mockData.loras];
        
        if (tags) {
            const tagArray = tags.split(',');
            filteredLoras = filteredLoras.filter(lora => 
                tagArray.some(tag => lora.tags.includes(tag))
            );
        }
        
        if (type) {
            filteredLoras = filteredLoras.filter(lora => lora.type === type);
        }
        
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedLoras = filteredLoras.slice(start, end);
        
        return {
            loras: paginatedLoras,
            pagination: {
                page,
                limit,
                total: filteredLoras.length,
                pages: Math.ceil(filteredLoras.length / limit)
            }
        };
    },
    
    'GET /api/loras/:id': (url) => {
        const id = url.split('/').pop();
        const lora = mockData.loras.find(l => l.id === id);
        
        if (!lora) {
            throw new Error('LoRA not found');
        }
        
        return lora;
    },
    
    'POST /api/loras/upload': (url, options) => {
        // Check if proper form data was sent
        const hasFormData = options.body instanceof FormData;
        
        if (!hasFormData) {
            throw new Error('File is required');
        }
        
        // In a real scenario, we'd check if formData has file
        // For mocking, we assume empty FormData means no file
        const isEmpty = options.body.entries ? !Array.from(options.body.entries()).length : false;
        
        if (isEmpty) {
            throw new Error('File is required');
        }
        
        return {
            id: 'new-lora-id',
            name: 'Test LoRA', // Extract from form data in real implementation
            message: 'LoRA uploaded successfully',
            status: 'processing'
        };
    },
    
    'DELETE /api/loras/:id': () => ({
        message: 'LoRA deleted successfully'
    }),
    
    // Recommendations
    'GET /api/recommendations': (url) => {
        const urlObj = new URL(url, 'http://localhost');
        const limit = parseInt(urlObj.searchParams.get('limit')) || 10;
        
        return {
            recommendations: mockData.recommendations.slice(0, limit)
        };
    },
    
    'POST /api/recommendations/feedback': () => ({
        message: 'Feedback recorded successfully'
    }),
    
    // Analytics
    'GET /api/analytics': (url) => {
        const urlObj = new URL(url, 'http://localhost');
        const timeRange = urlObj.searchParams.get('timeRange') || '24h';
        
        return {
            ...mockData.analytics,
            timeRange
        };
    },
    
    'GET /api/analytics/export': (url) => {
        const urlObj = new URL(url, 'http://localhost');
        const format = urlObj.searchParams.get('format') || 'json';
        
        if (format === 'csv') {
            return 'timestamp,response_time,memory_usage\n2024-01-01T00:00:00Z,245,75.2';
        }
        
        return mockData.analytics;
    },
    
    // Admin
    'GET /api/admin/overview': () => mockData.admin.overview,
    
    'GET /api/admin/workers': () => mockData.admin.workers,
    
    'POST /api/admin/workers/:id/restart': () => ({
        message: 'Worker restarted successfully'
    }),
    
    // Import/Export
    'POST /api/export': () => new Blob(['mock export data'], { type: 'application/json' }),
    
    'POST /api/import': () => ({
        message: 'Import started successfully',
        job_id: 'import-job-123'
    })
};

// Mock fetch implementation
const mockFetch = (url, options = {}) => {
    const method = options.method || 'GET';
    
    // Extract the path from the full URL
    let path;
    try {
        const urlObj = new URL(url);
        path = urlObj.pathname;
    } catch {
        // If URL parsing fails, assume it's already a path
        path = url;
    }
    
    // Create keys for exact and pattern matching
    const exactKey = `${method} ${path}`;
    const patternKey = `${method} ${path.replace(/\/[^/]+$/, '/:id')}`;
    
    // Try exact match first, then pattern match
    const mockFn = apiMocks[exactKey] || apiMocks[patternKey];
    
    if (!mockFn) {
        // Handle unknown endpoints
        if (url.includes('nonexistent')) {
            return Promise.resolve({
                ok: false,
                status: 404,
                json: () => Promise.resolve({ error: 'Not found' }),
                text: () => Promise.resolve('Not found'),
                headers: new Map([['content-type', 'application/json']])
            });
        }
        
        console.log(`No mock found for: ${method} ${path} (tried: ${exactKey}, ${patternKey})`);
        
        return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'Internal server error' }),
            text: () => Promise.resolve('Internal server error')
        });
    }
    
    try {
        const data = mockFn(url, options);
        const isBlob = data instanceof Blob;
        
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => isBlob ? Promise.reject(new Error('Cannot parse blob as JSON')) : Promise.resolve(data),
            text: () => isBlob ? data.text() : Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
            blob: () => isBlob ? Promise.resolve(data) : Promise.resolve(new Blob([JSON.stringify(data)])),
            headers: new Map([
                ['content-type', isBlob ? 'application/octet-stream' : 'application/json']
            ])
        });
    } catch (error) {
        // Handle validation errors with 400 status
        if (error.message.includes('required') || error.message.includes('validation')) {
            return Promise.resolve({
                ok: false,
                status: 400,
                json: () => Promise.resolve({ error: error.message }),
                text: () => Promise.resolve(error.message)
            });
        }
        
        // Handle not found errors with 404 status
        if (error.message.includes('not found')) {
            return Promise.resolve({
                ok: false,
                status: 404,
                json: () => Promise.resolve({ error: error.message }),
                text: () => Promise.resolve(error.message)
            });
        }
        
        // Default to 500 for other errors
        return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: error.message }),
            text: () => Promise.resolve(error.message)
        });
    }
};

// Set up fetch mock
beforeEach(() => {
    fetch.mockImplementation(mockFetch);
});

afterEach(() => {
    fetch.mockClear();
});

module.exports = {
    mockFetch,
    mockData,
    apiMocks
};
