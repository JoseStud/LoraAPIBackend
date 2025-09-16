/**
 * Tests for Generation Studio Modular Components
 * 
 * Comprehensive test suite covering all generation studio modules.
 */

// Mock fetch globally
global.fetch = jest.fn();

describe('Generation Studio - Modular Components', () => {
    
    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Reset globals
        global.window = {
            dispatchEvent: jest.fn(),
            location: { 
                search: '',
                href: 'http://localhost'
            },
            history: {
                pushState: jest.fn(),
                replaceState: jest.fn()
            }
        };
        
        global.localStorage = {
            getItem: jest.fn(),
            setItem: jest.fn(),
            removeItem: jest.fn()
        };
        
        global.navigator = {
            clipboard: {
                writeText: jest.fn().mockResolvedValue()
            }
        };
        
        global.document = {
            createElement: jest.fn().mockReturnValue({
                style: {},
                focus: jest.fn(),
                select: jest.fn(),
                click: jest.fn()
            }),
            body: {
                appendChild: jest.fn(),
                removeChild: jest.fn()
            },
            execCommand: jest.fn().mockReturnValue(true),
            addEventListener: jest.fn(),
            removeEventListener: jest.fn(),
            activeElement: null
        };
        
        global.URL = {
            createObjectURL: jest.fn().mockReturnValue('blob:url'),
            revokeObjectURL: jest.fn()
        };
        
        global.WebSocket = jest.fn(() => ({
            send: jest.fn(),
            close: jest.fn(),
            readyState: 1,
            addEventListener: jest.fn(),
            removeEventListener: jest.fn()
        }));
        
        global.confirm = jest.fn().mockReturnValue(true);
        global.prompt = jest.fn().mockReturnValue('test name');
        
        global.Blob = class MockBlob {
            constructor(parts, options) {
                this.parts = parts;
                this.options = options;
                this.type = options?.type || '';
                this.size = parts?.reduce((sum, part) => sum + (part?.length || 0), 0) || 0;
            }
        };
    });
    
    describe('State Management Module', () => {
        let state;
        
        beforeEach(() => {
            // Load state module using require (Node.js environment)
            const { generationState } = require('../../../app/frontend/static/js/components/generation-studio/state.js');
            global.window.generationState = generationState;
            state = generationState.createInitialState();
        });
        
        afterEach(() => {
            delete global.window.generationState;
        });
        
        test('should create initial state with correct structure', () => {
            expect(state).toHaveProperty('params');
            expect(state).toHaveProperty('activeJobs');
            expect(state).toHaveProperty('recentResults');
            expect(state).toHaveProperty('systemStatus');
            expect(state).toHaveProperty('isGenerating');
            expect(state.isGenerating).toBe(false);
        });
        
        test('should update parameters correctly', () => {
            const newParams = { prompt: 'test prompt', steps: 30 };
            global.window.generationState.updateParams(state, newParams);
            
            expect(state.params.prompt).toBe('test prompt');
            expect(state.params.steps).toBe(30);
        });
        
        test('should add and manage active jobs', () => {
            const job = {
                id: 'job-1',
                prompt: 'test prompt',
                status: 'processing'
            };
            
            global.window.generationState.addActiveJob(state, job);
            expect(state.activeJobs).toHaveLength(1);
            expect(state.activeJobs[0].id).toBe('job-1');
            
            global.window.generationState.removeActiveJob(state, 'job-1');
            expect(state.activeJobs).toHaveLength(0);
        });
        
        test('should manage recent results', () => {
            const result = {
                id: 'result-1',
                prompt: 'test prompt',
                image_url: '/test.jpg'
            };
            
            global.window.generationState.addRecentResult(state, result);
            expect(state.recentResults).toHaveLength(1);
            
            global.window.generationState.removeRecentResult(state, 'result-1');
            expect(state.recentResults).toHaveLength(0);
        });
    });
    
    describe('Progress Module', () => {
        beforeEach(() => {
            const { generationProgress } = require('../../../app/frontend/static/js/components/generation-studio/progress.js');
            global.window.generationProgress = generationProgress;
        });
        
        afterEach(() => {
            delete global.window.generationProgress;
        });
        
        test('should format duration correctly', () => {
            expect(global.window.generationProgress.formatDuration(30)).toBe('30s');
            expect(global.window.generationProgress.formatDuration(90)).toBe('1m 30s');
            expect(global.window.generationProgress.formatDuration(3660)).toBe('1h 1m');
        });
        
        test('should get progress bar configuration', () => {
            const job = {
                status: 'processing',
                progress: 75,
                current_step: 15,
                total_steps: 20
            };
            
            const config = global.window.generationProgress.getProgressBarConfig(job);
            
            expect(config.progress).toBe(75);
            expect(config.color).toBe('green');
            expect(config.animated).toBe(true);
        });
        
        test('should sort jobs by priority', () => {
            const jobs = [
                { id: '1', status: 'completed', created_at: '2023-01-01' },
                { id: '2', status: 'processing', created_at: '2023-01-02' },
                { id: '3', status: 'queued', created_at: '2023-01-03' }
            ];
            
            const sorted = global.window.generationProgress.sortJobsByPriority(jobs);
            
            expect(sorted[0].status).toBe('processing');
            expect(sorted[1].status).toBe('queued');
            expect(sorted[2].status).toBe('completed');
        });
    });
    
    describe('Results Module', () => {
        beforeEach(() => {
            const { generationResults } = require('../../../app/frontend/static/js/components/generation-studio/results.js');
            global.window.generationResults = generationResults;
        });
        
        afterEach(() => {
            delete global.window.generationResults;
        });
        
        test('should format file sizes correctly', () => {
            expect(global.window.generationResults.formatFileSize(1024)).toBe('1.0 KB');
            expect(global.window.generationResults.formatFileSize(1048576)).toBe('1.0 MB');
            expect(global.window.generationResults.formatFileSize(1073741824)).toBe('1.0 GB');
        });
        
        test('should calculate aspect ratios', () => {
            const result = { width: 512, height: 512 };
            expect(global.window.generationResults.getAspectRatio(result)).toBe('1:1');
            
            const result2 = { width: 1024, height: 768 };
            expect(global.window.generationResults.getAspectRatio(result2)).toBe('4:3');
        });
        
        test('should extract parameters from results', () => {
            const result = {
                prompt: 'test prompt',
                width: 512,
                height: 512,
                steps: 25,
                cfg_scale: 8.0,
                seed: 12345
            };
            
            const params = global.window.generationResults.extractParameters(result);
            
            expect(params.prompt).toBe('test prompt');
            expect(params.width).toBe(512);
            expect(params.steps).toBe(25);
            expect(params.seed).toBe(12345);
        });
    });
    
    describe('UI Module', () => {
        beforeEach(() => {
            const { generationUI } = require('../../../app/frontend/static/js/components/generation-studio/ui.js');
            global.window.generationUI = generationUI;
            // Ensure dispatchEvent is a mock for assertions
            global.window.dispatchEvent = jest.fn();
            // Ensure clipboard writeText is mocked
            if (!global.navigator) global.navigator = {};
            if (!global.navigator.clipboard) global.navigator.clipboard = {};
            global.navigator.clipboard.writeText = jest.fn().mockResolvedValue();
            // Provide execCommand fallback for environments without clipboard
            if (!global.document.execCommand) {
                global.document.execCommand = jest.fn().mockReturnValue(true);
            }
        });
        
        afterEach(() => {
            delete global.window.generationUI;
        });
        
        test('should show toast notifications', () => {
            const result = global.window.generationUI.toast.show('Test message', 'success', 5000);
            
            expect(result.message).toBe('Test message');
            expect(result.type).toBe('success');
            expect(result.duration).toBe(5000);
            expect(global.window.dispatchEvent).toHaveBeenCalled();
        });
        
        test('should validate prompts correctly', () => {
            const validation = global.window.generationUI.validation.validatePrompt('');
            expect(validation.isValid).toBe(false);
            expect(validation.errors).toContain('Prompt is required');
            
            const validation2 = global.window.generationUI.validation.validatePrompt('Valid prompt');
            expect(validation2.isValid).toBe(true);
            expect(validation2.errors).toHaveLength(0);
        });
        
        test('should generate random prompts and parameters', () => {
            const prompt = global.window.generationUI.random.getPrompt();
            expect(typeof prompt).toBe('string');
            expect(prompt.length).toBeGreaterThan(0);
            
            const params = global.window.generationUI.random.getParams();
            expect(params).toHaveProperty('width');
            expect(params).toHaveProperty('height');
            expect(params).toHaveProperty('steps');
            expect(params).toHaveProperty('cfg_scale');
            expect(params).toHaveProperty('seed');
        });
        
        test('should copy text to clipboard', async () => {
            const success = await global.window.generationUI.clipboard.copyText('test text');
            
            expect(success).toBe(true);
            expect(global.navigator.clipboard.writeText).toHaveBeenCalledWith('test text');
        });
        
        test('should download blobs correctly', () => {
            const mockBlob = new global.Blob(['test content'], { type: 'text/plain' });
            
            const success = global.window.generationUI.download.blob(mockBlob, 'test.txt');
            
            expect(success).toBe(true);
        });
    });
    
    describe('API Module', () => {
        beforeEach(() => {
            global.fetch.mockResolvedValue({
                ok: true,
                json: jest.fn().mockResolvedValue({ status: 'success' })
            });
            
            const { generationAPI } = require('../../../app/frontend/static/js/components/generation-studio/api.js');
            global.window.generationAPI = generationAPI;
        });
        
        afterEach(() => {
            delete global.window.generationAPI;
        });
        
        test('should make API requests with correct configuration', async () => {
            const result = await global.window.generationAPI.loadSystemStatus();
            
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/system/status',
                expect.objectContaining({
                    method: 'GET',
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json'
                    })
                })
            );
            
            expect(result.success).toBe(true);
        });
        
        test('should validate generation parameters', () => {
            const params = {
                prompt: 'test prompt',
                width: 512,
                height: 512,
                steps: 20
            };
            
            const validated = global.window.generationAPI.validateGenerationParams(params);
            
            expect(validated.prompt).toBe('test prompt');
            expect(validated.width).toBe(512);
            expect(validated.height).toBe(512);
            expect(validated.steps).toBe(20);
        });
    });
    
    describe('WebSocket Module', () => {
        beforeEach(() => {
            const { generationWebSocket } = require('../../../app/frontend/static/js/components/generation-studio/websocket.js');
            global.window.generationWebSocket = generationWebSocket;
        });
        
        afterEach(() => {
            delete global.window.generationWebSocket;
        });
        
        test('should parse incoming messages', () => {
            const messageData = JSON.stringify({
                type: 'generation_progress',
                job_id: 'test',
                progress: 50,
                status: 'running',
                current_step: 5,
                total_steps: 100,
            });
            const parsed = global.window.generationWebSocket.parseMessage(messageData);
            
            expect(parsed.type).toBe('generation_progress');
            expect(parsed.payload.jobId).toBe('test');
            expect(parsed.payload.progress).toBe(50);
        });
        
        test('should create connection manager', () => {
            const manager = global.window.generationWebSocket.createConnectionManager({
                onOpen: jest.fn(),
                onMessage: jest.fn(),
                onClose: jest.fn(),
                onError: jest.fn()
            });
            
            expect(manager).toHaveProperty('connect');
            expect(manager).toHaveProperty('disconnect');
            expect(manager).toHaveProperty('sendMessage');
            expect(manager).toHaveProperty('isConnected');
        });
    });
    
    describe('Main Index Integration', () => {
        let component;
        
        beforeEach(() => {
            // Load all modules using require (Node.js environment)
            const { generationState } = require('../../../app/frontend/static/js/components/generation-studio/state.js');
            const { generationWebSocket } = require('../../../app/frontend/static/js/components/generation-studio/websocket.js');
            const { generationAPI } = require('../../../app/frontend/static/js/components/generation-studio/api.js');
            const { generationProgress } = require('../../../app/frontend/static/js/components/generation-studio/progress.js');
            const { generationResults } = require('../../../app/frontend/static/js/components/generation-studio/results.js');
            const { generationUI } = require('../../../app/frontend/static/js/components/generation-studio/ui.js');
            const { generationStudio } = require('../../../app/frontend/static/js/components/generation-studio/index.js');
            
            // Assign to global window
            global.window.generationState = generationState;
            global.window.generationWebSocket = generationWebSocket;
            global.window.generationAPI = generationAPI;
            global.window.generationProgress = generationProgress;
            global.window.generationResults = generationResults;
            global.window.generationUI = generationUI;
            global.window.generationStudio = generationStudio;
            
            component = generationStudio();
        });
        
        afterEach(() => {
            if (component && component.destroy) {
                component.destroy();
            }
            
            // Cleanup globals
            delete global.window.generationState;
            delete global.window.generationWebSocket;
            delete global.window.generationAPI;
            delete global.window.generationProgress;
            delete global.window.generationResults;
            delete global.window.generationUI;
            delete global.window.generationStudio;
        });
        
        test('should create component with correct structure', () => {
            expect(component).toHaveProperty('init');
            expect(component).toHaveProperty('startGeneration');
            expect(component).toHaveProperty('loadData');
            expect(component).toHaveProperty('params');
            expect(component).toHaveProperty('activeJobs');
            expect(component).toHaveProperty('recentResults');
        });
        
        test('should provide reactive getters', () => {
            // Add some test data
            component.activeJobs.push({
                id: 'job-1',
                status: 'processing',
                created_at: new Date().toISOString()
            });
            
            component.recentResults.push({
                id: 'result-1',
                prompt: 'test'
            });
            
            expect(component.hasActiveJobs).toBe(true);
            expect(component.hasRecentResults).toBe(true);
        });
    });
});
