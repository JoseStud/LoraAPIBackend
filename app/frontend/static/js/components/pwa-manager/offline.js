/**
 * PWA Manager - Offline Management Module
 * 
 * Handles offline detection, action queuing, and background synchronization.
 */

/**
 * Offline management and synchronization operations
 */
const pwaOffline = {
    /**
     * Initializes offline detection and management
     */
    init(callbacks = {}) {
        const state = {
            isOnline: navigator.onLine,
            queuedActions: this.loadQueuedActions(),
            callbacks
        };
        
        this.setupEventListeners(state);
        this.updateOnlineStatus(state.isOnline, callbacks);
        
        return state;
    },
    
    /**
     * Sets up online/offline event listeners
     */
    setupEventListeners(state) {
        const handleOnline = () => {
            state.isOnline = true;
            this.updateOnlineStatus(true, state.callbacks);
            this.syncPendingActions(state);
        };
        
        const handleOffline = () => {
            state.isOnline = false;
            this.updateOnlineStatus(false, state.callbacks);
        };
        
        const handleVisibilityChange = () => {
            if (!document.hidden && state.isOnline) {
                this.syncPendingActions(state);
            }
        };
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Return cleanup function
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    },
    
    /**
     * Updates online status and triggers callbacks
     */
    updateOnlineStatus(isOnline, callbacks = {}) {
        if (isOnline) {
            if (callbacks.onOnline) callbacks.onOnline();
        } else {
            if (callbacks.onOffline) callbacks.onOffline();
        }
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('pwa-connection-change', {
            detail: { isOnline, timestamp: Date.now() }
        }));
    },
    
    /**
     * Creates offline indicator UI
     */
    createOfflineIndicator(options = {}) {
        const {
            message = "You're offline. Some features may be limited.",
            className = 'pwa-offline-indicator'
        } = options;
        
        const indicator = document.createElement('div');
        indicator.id = 'offline-indicator';
        indicator.className = `${className} fixed top-0 left-0 right-0 bg-yellow-500 text-white text-center py-2 text-sm font-medium transform -translate-y-full transition-transform duration-300 z-50`;
        
        indicator.innerHTML = `
            <div class="flex items-center justify-center space-x-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
                </svg>
                <span>${message}</span>
            </div>
        `;
        
        return indicator;
    },
    
    /**
     * Shows/hides offline indicator
     */
    toggleOfflineIndicator(show) {
        const indicator = document.getElementById('offline-indicator');
        if (!indicator) return;
        
        if (show) {
            indicator.classList.remove('-translate-y-full');
        } else {
            indicator.classList.add('-translate-y-full');
        }
    },
    
    /**
     * Loads queued actions from storage
     */
    loadQueuedActions() {
        try {
            const stored = localStorage.getItem('pwa-queued-actions');
            const actions = stored ? JSON.parse(stored) : [];
            return Array.isArray(actions) ? actions : [];
        } catch (error) {
            return [];
        }
    },
    
    /**
     * Saves queued actions to storage
     */
    saveQueuedActions(actions) {
        try {
            localStorage.setItem('pwa-queued-actions', JSON.stringify(actions));
            return true;
        } catch (error) {
            if (window.DevLogger?.error) {
                window.DevLogger.error('[PWA] Failed to save queued actions:', error);
            }
            return false;
        }
    },
    
    /**
     * Queues an action for later execution
     */
    queueAction(action, state) {
        const queuedAction = {
            id: this.generateActionId(),
            timestamp: Date.now(),
            retryCount: 0,
            ...action
        };
        
        if (!state) {
            // Standalone mode - load current queue
            const currentQueue = this.loadQueuedActions();
            currentQueue.push(queuedAction);
            this.saveQueuedActions(currentQueue);
            return queuedAction;
        }
        
        state.queuedActions.push(queuedAction);
        this.saveQueuedActions(state.queuedActions);
        
        return queuedAction;
    },
    
    /**
     * Removes an action from the queue
     */
    removeQueuedAction(actionId, state) {
        if (!state) {
            const currentQueue = this.loadQueuedActions();
            const updated = currentQueue.filter(action => action.id !== actionId);
            this.saveQueuedActions(updated);
            return updated;
        }
        
        state.queuedActions = state.queuedActions.filter(action => action.id !== actionId);
        this.saveQueuedActions(state.queuedActions);
        
        return state.queuedActions;
    },
    
    /**
     * Syncs pending actions when online
     */
    async syncPendingActions(state, callbacks = {}) {
        if (!state.isOnline || !state.queuedActions.length) return;
        
        const actionsToSync = [...state.queuedActions];
        const syncedActions = [];
        const failedActions = [];
        
        for (const action of actionsToSync) {
            try {
                const success = await this.executeAction(action);
                
                if (success) {
                    syncedActions.push(action);
                    this.removeQueuedAction(action.id, state);
                } else {
                    action.retryCount = (action.retryCount || 0) + 1;
                    if (action.retryCount >= 3) {
                        failedActions.push(action);
                        this.removeQueuedAction(action.id, state);
                    }
                }
                
            } catch (error) {
                action.retryCount = (action.retryCount || 0) + 1;
                action.lastError = error.message;
                
                if (action.retryCount >= 3) {
                    failedActions.push(action);
                    this.removeQueuedAction(action.id, state);
                }
            }
        }
        
        // Trigger callbacks
        if (syncedActions.length > 0 && callbacks.onSyncSuccess) {
            callbacks.onSyncSuccess(syncedActions);
        }
        
        if (failedActions.length > 0 && callbacks.onSyncFailure) {
            callbacks.onSyncFailure(failedActions);
        }
        
        return {
            synced: syncedActions.length,
            failed: failedActions.length,
            remaining: state.queuedActions.length
        };
    },
    
    /**
     * Executes a queued action
     */
    async executeAction(action) {
        const { url, options, type } = action;
        
        if (type === 'fetch') {
            try {
                const response = await fetch(url, options);
                return response.ok;
            } catch (error) {
                return false;
            }
        }
        
        if (type === 'custom' && action.execute) {
            try {
                return await action.execute();
            } catch (error) {
                return false;
            }
        }
        
        return false;
    },
    
    /**
     * Generates a unique action ID
     */
    generateActionId() {
        return `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    /**
     * Intercepts fetch requests for offline handling
     */
    interceptFetch(isOnline, queueHandler) {
        const originalFetch = window.fetch;
        
        window.fetch = async (url, options = {}) => {
            try {
                // Always attempt the request first
                const response = await originalFetch(url, options);
                
                if (response.ok) {
                    return response;
                }
                
                // If request failed and we're offline, queue it
                if (!isOnline && options.method && options.method !== 'GET') {
                    queueHandler({ url, options, type: 'fetch' });
                    
                    return new Response(JSON.stringify({
                        success: false,
                        message: 'Action queued for when connection is restored',
                        offline: true,
                        queued: true
                    }), {
                        status: 202,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                return response;
                
            } catch (error) {
                // If we're offline and this is a modifying request, queue it
                if (!isOnline && options.method && options.method !== 'GET') {
                    queueHandler({ url, options, type: 'fetch' });
                    
                    return new Response(JSON.stringify({
                        success: false,
                        message: 'Action queued for when connection is restored',
                        offline: true,
                        queued: true
                    }), {
                        status: 202,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
                
                // For GET requests or when online, return offline response
                return new Response(JSON.stringify({
                    success: false,
                    message: 'You are offline. Please check your connection.',
                    offline: true
                }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        };
        
        // Return restore function
        return () => {
            window.fetch = originalFetch;
        };
    },
    
    /**
     * Gets offline status information
     */
    getOfflineStatus(state) {
        return {
            isOnline: state ? state.isOnline : navigator.onLine,
            queuedActionsCount: state ? state.queuedActions.length : this.loadQueuedActions().length,
            lastOnlineTime: this.getLastOnlineTime(),
            offlineDuration: this.getOfflineDuration(),
            connectionType: this.getConnectionType(),
            networkQuality: this.getNetworkQuality()
        };
    },
    
    /**
     * Gets last known online time
     */
    getLastOnlineTime() {
        const lastOnline = localStorage.getItem('pwa-last-online');
        return lastOnline ? new Date(parseInt(lastOnline)) : null;
    },
    
    /**
     * Sets last online time
     */
    setLastOnlineTime() {
        localStorage.setItem('pwa-last-online', Date.now().toString());
    },
    
    /**
     * Gets offline duration
     */
    getOfflineDuration() {
        if (navigator.onLine) return 0;
        
        const lastOnline = this.getLastOnlineTime();
        if (!lastOnline) return null;
        
        return Date.now() - lastOnline.getTime();
    },
    
    /**
     * Gets connection type if available
     */
    getConnectionType() {
        if ('connection' in navigator) {
            return {
                effectiveType: navigator.connection.effectiveType,
                type: navigator.connection.type,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt,
                saveData: navigator.connection.saveData
            };
        }
        return null;
    },
    
    /**
     * Estimates network quality
     */
    getNetworkQuality() {
        if (!('connection' in navigator)) return 'unknown';
        
        const connection = navigator.connection;
        
        if (connection.effectiveType === '4g' && connection.downlink > 10) {
            return 'excellent';
        } else if (connection.effectiveType === '4g' || connection.downlink > 5) {
            return 'good';
        } else if (connection.effectiveType === '3g' || connection.downlink > 1) {
            return 'fair';
        } else {
            return 'poor';
        }
    },
    
    /**
     * Clears all queued actions
     */
    clearQueuedActions(state) {
        if (state) {
            state.queuedActions = [];
        }
        
        localStorage.removeItem('pwa-queued-actions');
    },
    
    /**
     * Gets queued actions summary
     */
    getQueuedActionsSummary(state) {
        const actions = state ? state.queuedActions : this.loadQueuedActions();
        
        const summary = {
            total: actions.length,
            byType: {},
            oldestAction: null,
            newestAction: null,
            failedActions: actions.filter(a => a.retryCount >= 3).length,
            retryingActions: actions.filter(a => a.retryCount > 0 && a.retryCount < 3).length
        };
        
        actions.forEach(action => {
            const type = action.type || 'unknown';
            summary.byType[type] = (summary.byType[type] || 0) + 1;
            
            if (!summary.oldestAction || action.timestamp < summary.oldestAction.timestamp) {
                summary.oldestAction = action;
            }
            
            if (!summary.newestAction || action.timestamp > summary.newestAction.timestamp) {
                summary.newestAction = action;
            }
        });
        
        return summary;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pwaOffline };
} else if (typeof window !== 'undefined') {
    window.pwaOffline = pwaOffline;
}
