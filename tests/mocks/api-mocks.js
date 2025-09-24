/**
 * API Mocks for Integration Tests
 * Provides realistic mock responses for all API endpoints
 */

import { afterEach, beforeEach, vi } from 'vitest';

// Mock fetch globally for all tests
global.fetch = vi.fn();

// Mock WebSocket
global.WebSocket = vi.fn().mockImplementation((url) => {
    return {
        close: vi.fn(),
        send: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
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
    },
    adapters: [
        {
            id: 'adapter-1',
            name: 'Portrait Enhancer',
            description: 'Boosts portrait generation quality',
            active: true,
            tags: ['portrait', 'people'],
            stats: {
                usage_count: 120,
                success_rate: 0.92,
                avg_time: 42,
            },
        },
        {
            id: 'adapter-2',
            name: 'Landscape Booster',
            description: 'Optimized for scenic landscapes',
            active: false,
            tags: ['landscape', 'nature'],
            stats: {
                usage_count: 85,
                success_rate: 0.88,
                avg_time: 55,
            },
        },
        {
            id: 'adapter-3',
            name: 'Anime Style Pro',
            description: 'Creates stylized anime visuals',
            active: true,
            tags: ['anime', 'character'],
            stats: {
                usage_count: 200,
                success_rate: 0.95,
                avg_time: 38,
            },
        },
    ],
    adapterTags: ['portrait', 'people', 'landscape', 'nature', 'anime', 'character'],
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

    'POST /api/loras': (url, options = {}) => {
        try {
            const body = options.body ? JSON.parse(options.body) : {};
            if (!body.name || !body.type) {
                throw new Error('validation: name and type are required');
            }

            return {
                id: `created-${Date.now()}`,
                ...body,
                created_at: new Date('2024-01-05T00:00:00Z').toISOString(),
                updated_at: new Date('2024-01-05T00:00:00Z').toISOString(),
            };
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error('validation: malformed JSON');
            }
            throw error;
        }
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

    // Generation Workflows
    'POST /api/v1/generation/generate': (url, options = {}) => {
        let payload = {};
        try {
            payload = options.body ? JSON.parse(options.body) : {};
        } catch {
            // ignore malformed JSON in tests
        }

        return {
            job_id: `job-${Date.now()}`,
            status: 'queued',
            progress: 0,
            parameters: payload,
        };
    },

    'GET /api/v1/generation/jobs/active': () => ([
        {
            job_id: 'job-1',
            id: 'job-1',
            status: 'processing',
            progress: 45,
            prompt: 'Test prompt',
            eta: 30,
            created_at: new Date().toISOString(),
        },
        {
            job_id: 'job-2',
            id: 'job-2',
            status: 'queued',
            progress: 0,
            prompt: 'Another prompt',
            created_at: new Date().toISOString(),
        },
    ]),

    'GET /api/v1/generation/results': (url) => {
        let limit = 5;
        try {
            const urlObj = new URL(url, 'http://localhost');
            limit = parseInt(urlObj.searchParams.get('limit')) || limit;
        } catch {
            // ignore invalid URLs in tests
        }

        return Array.from({ length: Math.max(1, limit) }).map((_, index) => ({
            id: `result-${index + 1}`,
            prompt: `Generated prompt ${index + 1}`,
            status: 'completed',
            width: 512,
            height: 512,
            steps: 20,
            cfg_scale: 7,
            seed: 42 + index,
            image_url: `https://example.com/generated-${index + 1}.png`,
            created_at: new Date(Date.now() - index * 60000).toISOString(),
        }));
    },

    'POST /api/v1/generation/jobs/:id/cancel': () => ({ success: true }),

    'DELETE /api/v1/generation/results/:id': () => ({ success: true }),

    // Adapter Catalog
    'GET /api/v1/adapters': (url) => {
        let page = 1;
        let perPage = 20;
        try {
            const urlObj = new URL(url, 'http://localhost');
            page = parseInt(urlObj.searchParams.get('page')) || page;
            perPage = parseInt(urlObj.searchParams.get('perPage')) || perPage;
        } catch {
            // ignore invalid URLs in tests
        }

        const start = Math.max(0, (page - 1) * perPage);
        const items = mockData.adapters.slice(start, start + perPage);
        return {
            items,
            total: mockData.adapters.length,
            page,
            per_page: perPage,
        };
    },

    'GET /api/v1/adapters/tags': () => ({ tags: mockData.adapterTags }),

    'POST /api/v1/adapters/bulk': (url, options = {}) => {
        let body = {};
        try {
            body = options.body ? JSON.parse(options.body) : {};
        } catch {
            body = {};
        }

        const ids = Array.isArray(body?.ids) ? body.ids : mockData.adapters.map((adapter) => adapter.id);
        return {
            success: true,
            updated: ids,
        };
    },

    // Recommendations
    'GET /api/recommendations': (url) => {
        const urlObj = new URL(url, 'http://localhost');
        const limit = parseInt(urlObj.searchParams.get('limit')) || 10;
        
        return {
            recommendations: mockData.recommendations.slice(0, limit)
        };
    },
    
    'POST /api/recommendations/feedback': () => ({
        success: true,
        message: 'Feedback recorded successfully'
    }),
    
    // Analytics
    'GET /api/analytics': (url) => {
        const urlObj = new URL(url, 'http://localhost');
        const timeRange = urlObj.searchParams.get('timeRange') || '24h';

        return {
            kpis: mockData.analytics.kpis,
            systemMetrics: {
                cpu_usage: '15%',
                memory_usage: '2.1 GB / 4.0 GB',
                storage_usage: '1.1 TB / 2.0 TB',
            },
            performanceMetrics: mockData.analytics.performance_metrics,
            usageStats: mockData.analytics.usage_stats,
            timeRange,
        };
    },

    'GET /api/analytics/export': (url) => {
        const urlObj = new URL(url, 'http://localhost');
        const format = urlObj.searchParams.get('format') || 'json';

        if (format === 'csv') {
            const csv = 'timestamp,response_time,memory_usage\n2024-01-01T00:00:00Z,245,75.2';
            return new Response(csv, {
                status: 200,
                headers: { 'content-type': 'text/csv' },
            });
        }

        const payload = {
            timestamp: new Date('2024-01-01T00:00:00Z').toISOString(),
            data: mockData.analytics,
        };

        return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    },

    // Admin
    'GET /api/admin/overview': () => ({
        ...mockData.admin.overview,
        cpuUsage: '15%',
        memoryUsage: '2.1 GB / 4.0 GB',
        diskUsage: '45% of 2 TB',
    }),

    'GET /api/admin/workers': () => ({
        active: mockData.admin.workers.workers.filter(worker => worker.status === 'active'),
        inactive: mockData.admin.workers.workers.filter(worker => worker.status !== 'active'),
        failed: [],
        workers: mockData.admin.workers.workers,
    }),

    'GET /api/admin/settings': (url, options = {}) => {
        const headers = options.headers instanceof Headers
            ? options.headers
            : new Headers(options.headers ?? {});
        const authHeader = headers.get('Authorization') ?? '';
        if (authHeader.includes('invalid')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 403,
                headers: { 'content-type': 'application/json' },
            });
        }

        return {
            feature_flags: {
                enableBackups: true,
                enableRecommendations: true,
            },
            auditLogging: true,
        };
    },

    'POST /api/admin/workers/:id/restart': () => ({
        message: 'Worker restarted successfully'
    }),
    
    // Import/Export
    'POST /api/export': () => new Blob(['mock export data'], { type: 'application/json' }),
    
    'POST /api/import': () => ({
        success: true,
        message: 'Import started successfully',
        job_id: 'import-job-123',
        processed_files: 1,
        total_files: 1,
    }),

    'GET /api/v1/dashboard/stats': () => ({
        stats: {
            total_loras: mockData.loras.length,
            active_loras: mockData.loras.length - 1,
            embeddings_coverage: 85,
            recent_imports: 4,
        },
        system_health: {
            gpu_memory: '10 GB / 24 GB',
            storage_usage: '1.1 TB / 2.0 TB',
            cpu_usage: '15%',
            uptime: '7 days 12 hours',
            gpus: [
                { name: 'RTX 4090', memory_used: '10 GB / 24 GB', temperature: '65°C' },
            ],
        },
    }),

    'GET /api/v1/system/status': () => ({
        status: 'ok',
        queues: {
            active_jobs: mockData.loras.length,
            scheduled_jobs: 2,
        },
        services: {
            database: 'online',
            cache: 'online',
        },
        version: '2.1.0',
    }),

    'GET /frontend/settings': () => ({
        backendUrl: '/api/v1',
        features: {
            enableRecommendations: true,
            enableImportExport: true,
        },
    }),
};

// Mock fetch implementation
const mockFetch = (url, options = {}) => {
    const method = options.method ? options.method.toUpperCase() : 'GET';

    // Extract the path from the full URL
    let path;
    try {
        const urlObj = new URL(url, 'http://localhost');
        path = urlObj.pathname;
    } catch {
        path = typeof url === 'string' ? url : '/';
    }

    let normalizedPath = path || '/';
    if (!normalizedPath.startsWith('/')) {
        normalizedPath = `/${normalizedPath}`;
    }
    if (normalizedPath.length > 1) {
        normalizedPath = normalizedPath.replace(/\/+$/, '');
    }

    const findHandler = () => {
        const exactKey = `${method} ${normalizedPath}`;
        if (apiMocks[exactKey]) {
            return {
                handler: apiMocks[exactKey],
                exactKey,
                attemptedPatternKeys: [],
            };
        }

        const pathSegments = normalizedPath.split('/').filter(Boolean);
        const attemptedPatternKeys = [];

        for (const [key, handler] of Object.entries(apiMocks)) {
            const [patternMethod, patternPath] = key.split(' ');
            if (patternMethod !== method) {
                continue;
            }

            attemptedPatternKeys.push(key);

            let normalisedPattern = patternPath || '/';
            if (!normalisedPattern.startsWith('/')) {
                normalisedPattern = `/${normalisedPattern}`;
            }
            if (normalisedPattern.length > 1) {
                normalisedPattern = normalisedPattern.replace(/\/+$/, '');
            }

            const patternSegments = normalisedPattern.split('/').filter(Boolean);

            if (patternSegments.length !== pathSegments.length) {
                continue;
            }

            const matches = patternSegments.every((segment, index) => {
                return segment.startsWith(':') || segment === pathSegments[index];
            });

            if (matches) {
                return {
                    handler,
                    exactKey,
                    attemptedPatternKeys,
                };
            }
        }

        return {
            handler: undefined,
            exactKey,
            attemptedPatternKeys,
        };
    };

    const { handler: mockFn, exactKey, attemptedPatternKeys } = findHandler();

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
        
        const attemptedKeys = [exactKey, ...attemptedPatternKeys];
        const attemptedSummary = attemptedKeys.filter(Boolean).join(', ') || 'none';
        console.log(`No mock found for: ${method} ${normalizedPath} (tried: ${attemptedSummary})`);
        
        return Promise.resolve({
            ok: false,
            status: 500,
            json: () => Promise.resolve({ error: 'Internal server error' }),
            text: () => Promise.resolve('Internal server error')
        });
    }

    try {
        const data = mockFn(url, options);

        if (typeof Response !== 'undefined' && data instanceof Response) {
            return Promise.resolve(data);
        }

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

export { apiMocks, mockData, mockFetch };
