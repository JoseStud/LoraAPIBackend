// Alpine.js Global Configuration and Store
// This file sets up global Alpine.js stores and components for the LoRA Manager frontend

document.addEventListener('alpine:init', () => {
    // Global application store
    Alpine.store('app', {
        // Global state
        user: null,
        loras: [],
        activeJobs: [],
        systemStats: {},
        loading: false,
        
        // Global actions
        async loadLoras() {
            this.loading = true;
            try {
                const response = await fetch('/api/v1/adapters');
                if (response.ok) {
                    this.loras = await response.json();
                }
            } catch (error) {
                console.error('Failed to load LoRAs:', error);
            } finally {
                this.loading = false;
            }
        },
        
        async toggleLoraActive(loraId) {
            const lora = this.loras.find(l => l.id === loraId);
            if (!lora) return;
            
            const endpoint = lora.active ? 'deactivate' : 'activate';
            
            try {
                const response = await fetch(`/api/v1/adapters/${loraId}/${endpoint}`, {
                    method: 'POST'
                });
                
                if (response.ok) {
                    lora.active = !lora.active;
                    this.showNotification(`LoRA ${lora.active ? 'activated' : 'deactivated'}`, 'success');
                }
            } catch (error) {
                console.error('Failed to toggle LoRA:', error);
                this.showNotification('Failed to update LoRA', 'error');
            }
        },
        
        async getRecommendations(loraId) {
            try {
                const response = await fetch(`/api/v1/recommendations/similar/${loraId}`);
                if (response.ok) {
                    return await response.json();
                }
            } catch (error) {
                console.error('Failed to get recommendations:', error);
            }
            return [];
        },
        
        showNotification(message, type = 'info') {
            // Dispatch custom event for notifications
            document.dispatchEvent(new CustomEvent('show-notification', {
                detail: { message, type }
            }));
        }
    });

    // Notification store for toast messages
    Alpine.store('notifications', {
        items: [],
        
        add(message, type = 'info', duration = 5000) {
            const id = Date.now();
            this.items.push({ id, message, type });
            
            if (duration > 0) {
                setTimeout(() => this.remove(id), duration);
            }
        },
        
        remove(id) {
            this.items = this.items.filter(item => item.id !== id);
        },
        
        clear() {
            this.items = [];
        }
    });

    // WebSocket store for real-time updates
    Alpine.store('websocket', {
        connection: null,
        connected: false,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
        
        connect() {
            if (this.connection) return;
            
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/api/ws/progress`;
            
            this.connection = new WebSocket(wsUrl);
            
            this.connection.onopen = () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                console.log('WebSocket connected');
            };
            
            this.connection.onmessage = (event) => {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            };
            
            this.connection.onclose = () => {
                this.connected = false;
                this.connection = null;
                this.attemptReconnect();
            };
            
            this.connection.onerror = (error) => {
                console.error('WebSocket error:', error);
            };
        },
        
        disconnect() {
            if (this.connection) {
                this.connection.close();
                this.connection = null;
                this.connected = false;
            }
        },
        
        attemptReconnect() {
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                this.reconnectAttempts++;
                setTimeout(() => {
                    console.log(`Attempting WebSocket reconnection (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    this.connect();
                }, 2000 * this.reconnectAttempts);
            }
        },
        
        handleMessage(data) {
            // Handle different message types
            if (data.type === 'generation_progress') {
                document.dispatchEvent(new CustomEvent('generation-progress', { detail: data }));
            } else if (data.type === 'job_complete') {
                document.dispatchEvent(new CustomEvent('job-complete', { detail: data }));
            }
        }
    });
});

// Global Alpine.js components
Alpine.data('loraCard', (lora) => ({
    lora: lora,
    loading: false,
    
    async toggleActive() {
        this.loading = true;
        await Alpine.store('app').toggleLoraActive(this.lora.id);
        this.loading = false;
    },
    
    async getRecommendations() {
        const recommendations = await Alpine.store('app').getRecommendations(this.lora.id);
        // Dispatch event to show recommendations
        document.dispatchEvent(new CustomEvent('show-recommendations', {
            detail: { lora: this.lora, recommendations }
        }));
    },
    
    async generatePreview() {
        // Trigger preview generation
        document.dispatchEvent(new CustomEvent('generate-preview', {
            detail: { lora: this.lora }
        }));
    }
}));

Alpine.data('searchFilter', () => ({
    searchTerm: '',
    filters: {
        activeOnly: false,
        hasEmbeddings: false,
        tags: [],
        sortBy: 'name'
    },
    availableTags: [],
    
    init() {
        this.loadAvailableTags();
    },
    
    async loadAvailableTags() {
        try {
            const response = await fetch('/api/v1/adapters/tags');
            if (response.ok) {
                this.availableTags = await response.json();
            }
        } catch (error) {
            console.error('Failed to load tags:', error);
        }
    },
    
    search() {
        document.body.dispatchEvent(new CustomEvent('search-changed', {
            detail: { search: this.searchTerm }
        }));
    },
    
    applyFilters() {
        document.body.dispatchEvent(new CustomEvent('filter-changed', {
            detail: { filters: this.filters }
        }));
    }
}));

Alpine.data('generationMonitor', () => ({
    activeJobs: [],
    
    init() {
        this.connectWebSocket();
        this.loadActiveJobs();
    },
    
    connectWebSocket() {
        Alpine.store('websocket').connect();
        
        // Listen for generation progress
        document.addEventListener('generation-progress', (event) => {
            this.updateJobProgress(event.detail);
        });
        
        document.addEventListener('job-complete', (event) => {
            this.handleJobComplete(event.detail);
        });
    },
    
    async loadActiveJobs() {
        try {
            const response = await fetch('/api/v1/deliveries/jobs?status=processing');
            if (response.ok) {
                this.activeJobs = await response.json();
            }
        } catch (error) {
            console.error('Failed to load active jobs:', error);
        }
    },
    
    updateJobProgress(data) {
        const job = this.activeJobs.find(j => j.id === data.job_id);
        if (job) {
            job.progress = data.progress;
            job.status = data.status;
        }
    },
    
    handleJobComplete(data) {
        this.activeJobs = this.activeJobs.filter(j => j.id !== data.job_id);
        Alpine.store('notifications').add(`Job ${data.job_id} completed`, 'success');
    }
}));

// Global utility functions
window.LoRAManager = {
    // Format file sizes
    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    },
    
    // Format timestamps
    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString();
    },
    
    // Copy text to clipboard
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            Alpine.store('notifications').add('Copied to clipboard', 'success');
        } catch (error) {
            console.error('Failed to copy:', error);
            Alpine.store('notifications').add('Failed to copy', 'error');
        }
    },
    
    // Download file
    downloadFile(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
};

// Listen for global notification events
document.addEventListener('show-notification', (event) => {
    const { message, type } = event.detail;
    Alpine.store('notifications').add(message, type);
});
