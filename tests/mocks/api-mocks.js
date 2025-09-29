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

    'GET /api/v1/adapters': (url) => {
        const urlObj = new URL(url, 'http://localhost');
        const search = (urlObj.searchParams.get('search') || '').toLowerCase();
        const tags = urlObj.searchParams.getAll('tags');

        let adapters = [...mockData.loras];

        if (search) {
            adapters = adapters.filter((item) =>
                item.name.toLowerCase().includes(search) || item.description.toLowerCase().includes(search),
            );
        }

        if (tags.length > 0) {
            adapters = adapters.filter((item) => tags.every((tag) => item.tags.includes(tag)));
        }

        return {
            data: adapters,
            meta: {
                total: adapters.length,
                page: Number(urlObj.searchParams.get('page') ?? 1),
                page_size: Number(urlObj.searchParams.get('page_size') ?? adapters.length),
            },
        };
    },

    'GET /api/v1/adapters/tags': () => ({
        data: Array.from(new Set(mockData.loras.flatMap((item) => item.tags))),
    }),

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

    'POST /api/v1/adapters/bulk': (url, options = {}) => {
        try {
            const body = options.body ? JSON.parse(options.body) : {};
            if (!Array.isArray(body.ids) || typeof body.action !== 'string') {
                throw new Error('validation: ids and action are required');
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new Error('validation: malformed JSON');
            }
            throw error;
        }

        return { success: true };
    },

    'POST /api/generation/generate': () => ({
        job_id: 'job-1',
        status: 'queued',
        images: [],
        progress: 0,
        generation_info: null,
    }),

    'GET /api/v1/generation/jobs/active': () => ({
        data: [
            {
                id: 'job-1',
                status: 'queued',
                progress: 0,
                prompt: 'Test prompt',
                created_at: '2024-01-01T00:00:00Z',
            },
        ],
    }),

    'GET /api/v1/generation/results': (url) => {
        const urlObj = new URL(url, 'http://localhost');
        const limit = parseInt(urlObj.searchParams.get('limit')) || 10;

        return {
            data: mockData.loras.slice(0, limit).map((item, index) => ({
                id: `result-${index + 1}`,
                prompt: `Prompt ${index + 1}`,
                image_url: `/images/result-${index + 1}.png`,
                created_at: item.created_at,
                width: 512,
                height: 512,
                steps: 30,
                cfg_scale: 7,
                seed: 1234 + index,
            })),
        };
    },

    'POST /api/generation/jobs/:id/cancel': (url) => {
        const id = url.split('/').slice(-2)[0];
        return {
            success: true,
            status: 'cancelled',
            message: `Cancelled ${id}`,
        };
    },

    'POST /custom/api/generation/jobs/:id/cancel': (url) => {
        const id = url.split('/').slice(-2)[0];
        return {
            success: true,
            status: 'cancelled',
            message: `Cancelled ${id}`,
        };
    },

    'DELETE /api/generation/results/:id': () => ({ success: true }),

    'DELETE /prefixed/api/generation/results/:id': () => ({ success: true }),

    'GET /api/generation/results/:id/download': (url) => {
        const id = url.split('/').slice(-2)[0];
        return new Blob([`result-${id}`], { type: 'image/png' });
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
    'POST /api/v1/export/estimate': () => ({
        size: '512 MB',
        time: '5 minutes',
    }),

    'POST /api/v1/export': () => new Blob(['mock export data'], { type: 'application/zip' }),

    'POST /api/export': () => new Blob(['legacy export data'], { type: 'application/json' }),

    'POST /api/v1/import': () => ({
        success: true,
        processed_files: 2,
        total_files: 2,
    }),

    'POST /api/import': () => ({
        success: true,
        message: 'Import started successfully',
        job_id: 'import-job-123',
        processed_files: 1,
        total_files: 1,
    }),

    'GET /api/v1/backups/history': () => ({
        history: [
            {
                id: 'backup-1',
                type: 'full',
                size: 512 * 1024 * 1024,
                status: 'completed',
                created_at: '2024-01-01T00:00:00Z',
            },
            {
                id: 'backup-2',
                type: 'quick',
                size: 128 * 1024 * 1024,
                status: 'processing',
                created_at: '2024-01-02T12:00:00Z',
            },
        ],
    }),

    'POST /api/v1/backup/create': (url, options = {}) => {
        try {
            const body = options.body ? JSON.parse(options.body) : {};
            const backupType = body.backup_type ?? 'full';

            return {
                success: true,
                backup_id: `${backupType}-backup-${Date.now()}`,
            };
        } catch {
            return {
                success: true,
                backup_id: `backup-${Date.now()}`,
            };
        }
    },

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

    const directKey = `${method} ${normalizedPath}`;

    const findHandler = () => {
        if (apiMocks[directKey]) {
            return apiMocks[directKey];
        }

        const pathSegments = normalizedPath.split('/').filter(Boolean);

        for (const [key, handler] of Object.entries(apiMocks)) {
            const [patternMethod, patternPath] = key.split(' ');
            if (patternMethod !== method) {
                continue;
            }

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
                return handler;
            }
        }

        return undefined;
    };

    const mockFn = findHandler();

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
        
        console.log(
            `No mock found for: ${method} ${path} (tried: ${directKey}, ${Object.keys(apiMocks).join(', ')})`,
        );
        
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
