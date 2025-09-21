/**
 * Generation Studio - WebSocket Operations Module
 * 
 * Handles real-time communication via WebSocket connections.
 */

const DEFAULT_BACKEND_BASE = '/api/v1';

const normaliseBackendBase = (value) => {
    if (typeof value !== 'string') {
        return DEFAULT_BACKEND_BASE;
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return DEFAULT_BACKEND_BASE;
    }
    return trimmed.replace(/\/+$/, '');
};

const resolveBackendBase = () => {
    if (typeof window !== 'undefined' && typeof window.BACKEND_URL === 'string') {
        const configured = window.BACKEND_URL.trim();
        if (configured) {
            return normaliseBackendBase(configured);
        }
    }
    return DEFAULT_BACKEND_BASE;
};

const buildProgressWebSocketUrl = () => {
    const backendBase = resolveBackendBase();

    if (/^https?:\/\//i.test(backendBase)) {
        try {
            const url = new URL(backendBase);
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
            const basePath = url.pathname.replace(/\/+$/, '');
            url.pathname = `${basePath}/ws/progress`.replace(/\/+/g, '/');
            url.hash = '';
            url.search = '';
            return url.toString();
        } catch (error) {
            console.error('Failed to parse backend URL for WebSocket:', error);
        }
    }

    const basePath = backendBase.startsWith('/') ? backendBase : `/${backendBase}`;
    const normalizedPath = `${basePath.replace(/\/+$/, '')}/ws/progress`.replace(/\/+/g, '/');

    if (typeof window === 'undefined') {
        return normalizedPath;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${normalizedPath}`;
};

/**
 * WebSocket management for real-time generation updates
 */
const generationWebSocket = {
    /**
     * Initializes WebSocket connection
     */
    init(callbacks = {}) {
        const {
            onOpen = () => {},
            onMessage = () => {},
            onClose = () => {},
            onError = () => {},
            onReconnect = () => {}
        } = callbacks;
        
        try {
            const wsUrl = buildProgressWebSocketUrl();
            const websocket = new WebSocket(wsUrl);
            
            websocket.onopen = (event) => {
                this.log('WebSocket connected for generation updates');
                onOpen(event);
            };
            
            websocket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data, onMessage);
                } catch (error) {
                    this.log('Failed to parse WebSocket message:', error);
                }
            };
            
            websocket.onclose = (event) => {
                this.log('WebSocket disconnected, attempting reconnection...');
                onClose(event);
                
                // Attempt reconnection after delay
                setTimeout(() => {
                    this.log('Attempting WebSocket reconnection...');
                    onReconnect();
                }, 5000);
            };
            
            websocket.onerror = (error) => {
                this.log('WebSocket error:', error);
                onError(error);
            };
            
            return websocket;
        } catch (error) {
            this.log('Failed to initialize WebSocket:', error);
            onError(error);
            return null;
        }
    },
    
    /**
     * Handles incoming WebSocket messages
     */
    handleMessage(data, callback) {
        const messageInfo = this.parseMessage(data);
        
        if (messageInfo.isValid) {
            callback(messageInfo);
        } else {
            this.log('Unknown WebSocket message type:', messageInfo.type);
        }
    },
    
    /**
     * Parses and validates WebSocket messages
     */
    parseMessage(data) {
        // Accept either a string (JSON) or a plain object
        if (typeof data === 'string') {
            try { data = JSON.parse(data); } catch { data = {}; }
        }
        const messageInfo = {
            type: data.type,
            isValid: false,
            payload: null
        };
        
        switch (data.type) {
            case 'generation_progress':
                if (this.validateProgressMessage(data)) {
                    messageInfo.isValid = true;
                    messageInfo.payload = {
                        jobId: data.job_id,
                        progress: data.progress,
                        status: data.status,
                        currentStep: data.current_step,
                        totalSteps: data.total_steps,
                        eta: data.eta,
                        timestamp: data.timestamp || Date.now()
                    };
                }
                break;
                
            case 'generation_complete':
                if (this.validateCompleteMessage(data)) {
                    messageInfo.isValid = true;
                    messageInfo.payload = {
                        jobId: data.job_id,
                        resultId: data.result_id,
                        prompt: data.prompt,
                        negativePrompt: data.negative_prompt,
                        imageUrl: data.image_url,
                        thumbnailUrl: data.thumbnail_url,
                        width: data.width,
                        height: data.height,
                        steps: data.steps,
                        cfgScale: data.cfg_scale,
                        seed: data.seed,
                        batchCount: data.batch_count,
                        batchSize: data.batch_size,
                        generationTime: data.generation_time,
                        fileSize: data.file_size,
                        modelUsed: data.model_used,
                        timestamp: data.timestamp || Date.now()
                    };
                }
                break;
                
            case 'generation_error':
                if (this.validateErrorMessage(data)) {
                    messageInfo.isValid = true;
                    messageInfo.payload = {
                        jobId: data.job_id,
                        error: data.error,
                        errorCode: data.error_code,
                        details: data.details,
                        timestamp: data.timestamp || Date.now()
                    };
                }
                break;
                
            case 'queue_update':
                if (this.validateQueueMessage(data)) {
                    messageInfo.isValid = true;
                    messageInfo.payload = {
                        jobs: data.jobs,
                        queueLength: data.queue_length,
                        processingCount: data.processing_count,
                        timestamp: data.timestamp || Date.now()
                    };
                }
                break;
                
            case 'system_status':
                if (this.validateSystemMessage(data)) {
                    messageInfo.isValid = true;
                    messageInfo.payload = {
                        status: data.status,
                        memoryUsage: data.memory_usage,
                        gpuUsage: data.gpu_usage,
                        queueLength: data.queue_length,
                        activeWorkers: data.active_workers,
                        timestamp: data.timestamp || Date.now()
                    };
                }
                break;
                
            default:
                this.log('Unknown message type:', data.type);
        }
        
        return messageInfo;
    },
    
    /**
     * Validates progress message format
     */
    validateProgressMessage(data) {
        return data.job_id && 
               typeof data.progress === 'number' && 
               data.progress >= 0 && 
               data.progress <= 100 &&
               data.status;
    },
    
    /**
     * Validates completion message format
     */
    validateCompleteMessage(data) {
        return data.job_id && 
               data.result_id && 
               data.image_url &&
               data.prompt;
    },
    
    /**
     * Validates error message format
     */
    validateErrorMessage(data) {
        return data.job_id && data.error;
    },
    
    /**
     * Validates queue message format
     */
    validateQueueMessage(data) {
        return Array.isArray(data.jobs) && 
               typeof data.queue_length === 'number';
    },
    
    /**
     * Validates system status message format
     */
    validateSystemMessage(data) {
        return data.status && typeof data.status === 'object';
    },
    
    /**
     * Sends a message through WebSocket
     */
    send(websocket, messageType, payload) {
        if (!websocket || websocket.readyState !== WebSocket.OPEN) {
            this.log('WebSocket not available for sending message');
            return false;
        }
        
        try {
            const message = {
                type: messageType,
                timestamp: Date.now(),
                ...payload
            };
            
            websocket.send(JSON.stringify(message));
            return true;
        } catch (error) {
            this.log('Failed to send WebSocket message:', error);
            return false;
        }
    },
    
    /**
     * Requests job status update
     */
    requestJobStatus(websocket, jobId) {
        return this.send(websocket, 'request_job_status', { job_id: jobId });
    },
    
    /**
     * Requests queue status
     */
    requestQueueStatus(websocket) {
        return this.send(websocket, 'request_queue_status', {});
    },
    
    /**
     * Requests system status
     */
    requestSystemStatus(websocket) {
        return this.send(websocket, 'request_system_status', {});
    },
    
    /**
     * Subscribes to job updates
     */
    subscribeToJob(websocket, jobId) {
        return this.send(websocket, 'subscribe_job', { job_id: jobId });
    },
    
    /**
     * Unsubscribes from job updates
     */
    unsubscribeFromJob(websocket, jobId) {
        return this.send(websocket, 'unsubscribe_job', { job_id: jobId });
    },
    
    /**
     * Gets WebSocket connection status
     */
    getConnectionStatus(websocket) {
        if (!websocket) {
            return { status: 'not_initialized', ready: false };
        }
        
        const statusMap = {
            [WebSocket.CONNECTING]: { status: 'connecting', ready: false },
            [WebSocket.OPEN]: { status: 'connected', ready: true },
            [WebSocket.CLOSING]: { status: 'closing', ready: false },
            [WebSocket.CLOSED]: { status: 'closed', ready: false }
        };
        
        return statusMap[websocket.readyState] || { status: 'unknown', ready: false };
    },
    
    /**
     * Closes WebSocket connection gracefully
     */
    close(websocket) {
        if (websocket && websocket.readyState === WebSocket.OPEN) {
            websocket.close(1000, 'Component cleanup');
            return true;
        }
        return false;
    },
    
    /**
     * Creates WebSocket connection manager
     */
    createConnectionManager(callbacks = {}) {
        let websocket = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        let reconnectDelay = 1000; // Start with 1 second
        let isDestroyed = false;
        
        const connect = () => {
            if (isDestroyed) return null;
            
            websocket = this.init({
                onOpen: (event) => {
                    reconnectAttempts = 0;
                    reconnectDelay = 1000;
                    if (callbacks.onOpen) callbacks.onOpen(event);
                },
                
                onMessage: (messageInfo) => {
                    if (callbacks.onMessage) callbacks.onMessage(messageInfo);
                },
                
                onClose: (event) => {
                    if (callbacks.onClose) callbacks.onClose(event);
                },
                
                onError: (error) => {
                    if (callbacks.onError) callbacks.onError(error);
                },
                
                onReconnect: () => {
                    if (isDestroyed) return;
                    
                    if (reconnectAttempts < maxReconnectAttempts) {
                        reconnectAttempts++;
                        reconnectDelay = Math.min(reconnectDelay * 2, 30000); // Cap at 30 seconds
                        
                        setTimeout(() => {
                            if (!isDestroyed) {
                                this.log(`Reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
                                connect();
                            }
                        }, reconnectDelay);
                    } else {
                        this.log('Max reconnection attempts reached');
                        if (callbacks.onMaxReconnectAttempts) {
                            callbacks.onMaxReconnectAttempts();
                        }
                    }
                }
            });
            
            return websocket;
        };
        
        return {
            connect,
            send: (messageType, payload) => this.send(websocket, messageType, payload),
            // Aliases expected by some tests
            sendMessage: (messageType, payload) => this.send(websocket, messageType, payload),
            getStatus: () => this.getConnectionStatus(websocket),
            close: () => this.close(websocket),
            disconnect: () => this.close(websocket),
            destroy: () => {
                isDestroyed = true;
                this.close(websocket);
                websocket = null;
            },
            getWebSocket: () => websocket,
            isConnected: () => {
                const status = this.getConnectionStatus(websocket);
                return status.ready;
            }
        };
    },
    
    /**
     * Logging utility
     */
    log(message, ...args) {
        if (window.DevLogger) {
            window.DevLogger.info(`[GenerationWebSocket] ${message}`, ...args);
        } else {
            // eslint-disable-next-line no-console
            console.log(`[GenerationWebSocket] ${message}`, ...args);
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationWebSocket };
} else if (typeof window !== 'undefined') {
    window.generationWebSocket = generationWebSocket;
}
