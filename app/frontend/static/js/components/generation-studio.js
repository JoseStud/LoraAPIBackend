/**
 * Generation Studio Alpine.js Component
 * Handles image generation, progress monitoring, queue management, and results display
 */

import { fetchData, postData, deleteData } from '../utils/api.js';

function generationStudio() {
    return {
        // Generation Parameters
        params: {
            prompt: '',
            negative_prompt: '',
            width: 512,
            height: 512,
            steps: 20,
            cfg_scale: 7.0,
            seed: -1,
            batch_count: 1,
            batch_size: 1
        },
        
        // State
        activeJobs: [],
        recentResults: [],
        systemStatus: {},
        isGenerating: false,
        showHistory: false,
        showModal: false,
        selectedResult: null,
        
        // UI State
        showToast: false,
        toastMessage: '',
        websocket: null,
        pollInterval: null,
        
        // Initialization
        async init() {
            console.log('Initializing Generation Studio...');
            
            // Load initial data
            await this.loadSystemStatus();
            await this.loadRecentResults();
            await this.loadActiveJobs();
            
            // Initialize WebSocket connection for real-time updates
            this.initWebSocket();
            
            // Start polling for updates (fallback if WebSocket fails)
            this.startPolling();
            
            // Load parameters from URL if available
            this.loadFromURL();
        },
        
        // WebSocket Connection
        initWebSocket() {
            try {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const wsUrl = `${protocol}//${window.location.host}/ws/generation`;
                
                this.websocket = new WebSocket(wsUrl);
                
                this.websocket.onopen = () => {
                    console.log('WebSocket connected for generation updates');
                };
                
                this.websocket.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                };
                
                this.websocket.onclose = () => {
                    console.log('WebSocket disconnected, falling back to polling');
                    // Reconnect after 5 seconds
                    setTimeout(() => this.initWebSocket(), 5000);
                };
                
                this.websocket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                };
            } catch (error) {
                console.error('Failed to initialize WebSocket:', error);
            }
        },
        
        handleWebSocketMessage(data) {
            switch (data.type) {
                case 'generation_progress':
                    this.updateJobProgress(data.job_id, data.progress, data.status);
                    break;
                case 'generation_complete':
                    this.handleGenerationComplete(data);
                    break;
                case 'generation_error':
                    this.handleGenerationError(data);
                    break;
                case 'queue_update':
                    this.activeJobs = data.jobs;
                    break;
                default:
                    console.log('Unknown WebSocket message type:', data.type);
            }
        },
        
        // Polling (Fallback)
        startPolling() {
            this.pollInterval = setInterval(async () => {
                if (this.activeJobs.length > 0) {
                    await this.loadActiveJobs();
                }
                await this.loadSystemStatus();
            }, 2000);
        },
        
        stopPolling() {
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
            }
        },
        
        // API Methods
        async loadSystemStatus() {
            try {
                this.systemStatus = await fetchData((window?.BACKEND_URL || '') + '/system/status');
            } catch (error) {
                console.error('Failed to load system status:', error);
            }
        },
        
        async loadActiveJobs() {
            try {
                this.activeJobs = await fetchData((window?.BACKEND_URL || '') + '/generation/jobs/active');
            } catch (error) {
                console.error('Failed to load active jobs:', error);
            }
        },
        
        async loadRecentResults() {
            try {
                const limit = this.showHistory ? 50 : 10;
                this.recentResults = await fetchData((window?.BACKEND_URL || '') + `/generation/results?limit=${limit}`);
            } catch (error) {
                console.error('Failed to load recent results:', error);
            }
        },
        
        // Generation Methods
        async startGeneration() {
            if (!this.params.prompt.trim()) {
                this.showToastMessage('Please enter a prompt', 'error');
                return;
            }
            
            this.isGenerating = true;
            
            try {
                const result = await postData((window?.BACKEND_URL || '') + '/generation/generate', this.params);
                
                if (result.job_id) {
                    // Add job to active jobs list
                    const newJob = {
                        id: result.job_id,
                        prompt: this.params.prompt,
                        width: this.params.width,
                        height: this.params.height,
                        steps: this.params.steps,
                        status: 'queued',
                        progress: 0,
                        current_step: 0,
                        total_steps: this.params.steps,
                        created_at: new Date().toISOString()
                    };
                    
                    this.activeJobs.unshift(newJob);
                    this.showToastMessage('Generation started successfully', 'success');
                }
            } catch (error) {
                console.error('Error starting generation:', error);
                this.showToastMessage('Error starting generation', 'error');
            } finally {
                this.isGenerating = false;
            }
        },
        
        async cancelJob(jobId) {
            try {
                await postData((window?.BACKEND_URL || '') + `/generation/jobs/${jobId}/cancel`, {});
                this.activeJobs = this.activeJobs.filter(job => job.id !== jobId);
                this.showToastMessage('Generation cancelled', 'success');
            } catch (error) {
                console.error('Error cancelling job:', error);
                this.showToastMessage('Error cancelling generation', 'error');
            }
        },
        
        clearQueue() {
            if (this.activeJobs.length === 0) return;
            
            if (confirm('Are you sure you want to clear the entire generation queue?')) {
                this.activeJobs.forEach(job => {
                    if (job.status === 'queued') {
                        this.cancelJob(job.id);
                    }
                });
            }
        },
        
        // Job Progress Updates
        updateJobProgress(jobId, progress, status) {
            const job = this.activeJobs.find(j => j.id === jobId);
            if (job) {
                job.progress = progress;
                job.status = status;
                
                if (status === 'processing' && progress < 100) {
                    job.current_step = Math.floor((progress / 100) * job.total_steps);
                    
                    // Calculate ETA
                    if (job.start_time && progress > 5) {
                        const elapsed = (Date.now() - job.start_time) / 1000;
                        const estimated_total = (elapsed / progress) * 100;
                        const remaining = estimated_total - elapsed;
                        job.eta = this.formatTime(remaining);
                    }
                }
            }
        },
        
        handleGenerationComplete(data) {
            // Remove from active jobs
            this.activeJobs = this.activeJobs.filter(job => job.id !== data.job_id);
            
            // Add to recent results
            this.recentResults.unshift({
                id: data.result_id,
                job_id: data.job_id,
                prompt: data.prompt,
                image_url: data.image_url,
                width: data.width,
                height: data.height,
                steps: data.steps,
                cfg_scale: data.cfg_scale,
                seed: data.seed,
                created_at: new Date().toLocaleString()
            });
            
            this.showToastMessage('Generation completed successfully', 'success');
        },
        
        handleGenerationError(data) {
            // Remove from active jobs
            this.activeJobs = this.activeJobs.filter(job => job.id !== data.job_id);
            
            this.showToastMessage(`Generation failed: ${data.error}`, 'error');
        },
        
        // Result Management
        showImageModal(result) {
            this.selectedResult = result;
            this.showModal = true;
        },
        
        reuseParameters(result) {
            this.params.prompt = result.prompt;
            this.params.negative_prompt = result.negative_prompt || '';
            this.params.width = result.width;
            this.params.height = result.height;
            this.params.steps = result.steps;
            this.params.cfg_scale = result.cfg_scale;
            this.params.seed = result.seed;
            
            this.showToastMessage('Parameters loaded from result', 'success');
        },
        
        async deleteResult(resultId) {
            if (!confirm('Are you sure you want to delete this result?')) return;
            
            try {
                await deleteData((window?.BACKEND_URL || '') + `/generation/results/${resultId}`);
                this.recentResults = this.recentResults.filter(r => r.id !== resultId);
                this.showToastMessage('Result deleted', 'success');
            } catch (error) {
                console.error('Error deleting result:', error);
                this.showToastMessage('Error deleting result', 'error');
            }
        },
        
        async refreshResults() {
            await this.loadRecentResults();
            this.showToastMessage('Results refreshed', 'success');
        },
        
        // Quick Actions
        loadFromComposer() {
            // Try to load from localStorage or URL parameters
            const composerData = localStorage.getItem('composerPrompt');
            if (composerData) {
                this.params.prompt = composerData;
                this.showToastMessage('Loaded prompt from composer', 'success');
            } else {
                this.showToastMessage('No composer data found', 'warning');
            }
        },
        
        useRandomPrompt() {
            const randomPrompts = [
                'a beautiful anime girl with long flowing hair',
                'a majestic dragon soaring through cloudy skies',
                'a cyberpunk cityscape with neon lights',
                'a serene landscape with mountains and a lake',
                'a cute robot in a futuristic laboratory',
                'a magical forest with glowing mushrooms',
                'a space station orbiting a distant planet',
                'a steampunk airship flying over Victorian city'
            ];
            
            this.params.prompt = randomPrompts[Math.floor(Math.random() * randomPrompts.length)];
            this.showToastMessage('Random prompt generated', 'success');
        },
        
        savePreset() {
            const presetName = prompt('Enter a name for this preset:');
            if (!presetName) return;
            
            const preset = {
                name: presetName,
                params: { ...this.params },
                created_at: new Date().toISOString()
            };
            
            try {
                const savedPresets = JSON.parse(localStorage.getItem('generationPresets') || '[]');
                savedPresets.push(preset);
                localStorage.setItem('generationPresets', JSON.stringify(savedPresets));
                
                this.showToastMessage(`Preset "${presetName}" saved`, 'success');
            } catch (error) {
                console.error('Failed to save preset:', error);
                this.showToastMessage('Failed to save preset', 'error');
            }
        },
        
        // URL Parameter Handling
        loadFromURL() {
            const urlParams = new URLSearchParams(window.location.search);
            
            if (urlParams.has('prompt')) {
                this.params.prompt = urlParams.get('prompt');
            }
            if (urlParams.has('job_id')) {
                // If there's a specific job ID, focus on it
                const jobId = urlParams.get('job_id');
                // This could be used to highlight a specific job or show its progress
            }
        },
        
        // Utility Methods
        formatTime(seconds) {
            if (seconds < 60) {
                return `${Math.round(seconds)}s`;
            } else if (seconds < 3600) {
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = Math.round(seconds % 60);
                return `${minutes}m ${remainingSeconds}s`;
            } else {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                return `${hours}h ${minutes}m`;
            }
        },
        
        // Toast Notification System
        showToastMessage(message, type = 'success') {
            this.toastMessage = message;
            this.showToast = true;
            
            setTimeout(() => {
                this.showToast = false;
            }, 3000);
        },
        
        // Cleanup
        destroy() {
            if (this.websocket) {
                this.websocket.close();
            }
            this.stopPolling();
        }
    };
}

export { generationStudio };
