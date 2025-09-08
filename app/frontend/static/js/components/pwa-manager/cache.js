/**
 * PWA Manager - Cache Management Module
 * 
 * Handles cache operations, status monitoring, and cache strategies.
 */

/**
 * Cache management operations for PWA
 */
const pwaCache = {
    /**
     * Gets cache status from service worker
     */
    async getCacheStatus(registration) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        try {
            const response = await this.postMessageToSW(registration, { type: 'GET_CACHE_STATUS' });
            return response || { status: 'unknown', caches: [] };
        } catch (error) {
            throw new Error(`Failed to get cache status: ${error.message}`);
        }
    },
    
    /**
     * Clears all caches
     */
    async clearAllCaches(registration) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        try {
            const response = await this.postMessageToSW(registration, { type: 'CLEAR_CACHE' });
            return response?.success || false;
        } catch (error) {
            throw new Error(`Failed to clear caches: ${error.message}`);
        }
    },
    
    /**
     * Clears specific cache
     */
    async clearSpecificCache(registration, cacheName) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        try {
            const response = await this.postMessageToSW(registration, { 
                type: 'CLEAR_SPECIFIC_CACHE',
                cacheName 
            });
            return response?.success || false;
        } catch (error) {
            throw new Error(`Failed to clear cache ${cacheName}: ${error.message}`);
        }
    },
    
    /**
     * Gets cache size information
     */
    async getCacheSize(registration) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        try {
            const response = await this.postMessageToSW(registration, { type: 'GET_CACHE_SIZE' });
            return response || { totalSize: 0, caches: [] };
        } catch (error) {
            throw new Error(`Failed to get cache size: ${error.message}`);
        }
    },
    
    /**
     * Preloads critical resources
     */
    async preloadCriticalResources(registration, resources = []) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        try {
            const response = await this.postMessageToSW(registration, { 
                type: 'PRELOAD_RESOURCES',
                resources 
            });
            return response?.success || false;
        } catch (error) {
            throw new Error(`Failed to preload resources: ${error.message}`);
        }
    },
    
    /**
     * Gets cache statistics
     */
    async getCacheStatistics(registration) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        try {
            const response = await this.postMessageToSW(registration, { type: 'GET_CACHE_STATS' });
            return response || {
                hitRate: 0,
                missRate: 0,
                totalRequests: 0,
                cacheHits: 0,
                cacheMisses: 0,
                lastUpdated: null
            };
        } catch (error) {
            throw new Error(`Failed to get cache statistics: ${error.message}`);
        }
    },
    
    /**
     * Updates cache strategy
     */
    async updateCacheStrategy(registration, strategy) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        const validStrategies = ['cache-first', 'network-first', 'stale-while-revalidate', 'network-only', 'cache-only'];
        if (!validStrategies.includes(strategy)) {
            throw new Error(`Invalid cache strategy: ${strategy}`);
        }
        
        try {
            const response = await this.postMessageToSW(registration, { 
                type: 'UPDATE_CACHE_STRATEGY',
                strategy 
            });
            return response?.success || false;
        } catch (error) {
            throw new Error(`Failed to update cache strategy: ${error.message}`);
        }
    },
    
    /**
     * Forces cache update for specific resources
     */
    async forceCacheUpdate(registration, resources = []) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        try {
            const response = await this.postMessageToSW(registration, { 
                type: 'FORCE_CACHE_UPDATE',
                resources 
            });
            return response?.success || false;
        } catch (error) {
            throw new Error(`Failed to force cache update: ${error.message}`);
        }
    },
    
    /**
     * Gets cached resources list
     */
    async getCachedResources(registration, cacheName = null) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        try {
            const response = await this.postMessageToSW(registration, { 
                type: 'GET_CACHED_RESOURCES',
                cacheName 
            });
            return response?.resources || [];
        } catch (error) {
            throw new Error(`Failed to get cached resources: ${error.message}`);
        }
    },
    
    /**
     * Estimates storage quota usage
     */
    async getStorageEstimate() {
        if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
            return { quota: 0, usage: 0, available: 0, percent: 0 };
        }
        
        try {
            const estimate = await navigator.storage.estimate();
            const quota = estimate.quota || 0;
            const usage = estimate.usage || 0;
            const available = quota - usage;
            const percent = quota > 0 ? (usage / quota) * 100 : 0;
            
            return {
                quota,
                usage,
                available,
                percent,
                usageDetails: estimate.usageDetails || {}
            };
        } catch (error) {
            return { quota: 0, usage: 0, available: 0, percent: 0, error: error.message };
        }
    },
    
    /**
     * Requests persistent storage
     */
    async requestPersistentStorage() {
        if (!('storage' in navigator) || !('persist' in navigator.storage)) {
            return { granted: false, reason: 'API not supported' };
        }
        
        try {
            const granted = await navigator.storage.persist();
            return { granted, reason: granted ? 'Permission granted' : 'Permission denied' };
        } catch (error) {
            return { granted: false, reason: error.message };
        }
    },
    
    /**
     * Checks if storage is persistent
     */
    async isStoragePersistent() {
        if (!('storage' in navigator) || !('persisted' in navigator.storage)) {
            return false;
        }
        
        try {
            return await navigator.storage.persisted();
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Gets cache performance metrics
     */
    async getCachePerformance(registration) {
        const stats = await this.getCacheStatistics(registration);
        const storageInfo = await this.getStorageEstimate();
        const isPersistent = await this.isStoragePersistent();
        
        return {
            hitRate: stats.hitRate,
            missRate: stats.missRate,
            efficiency: stats.totalRequests > 0 ? (stats.cacheHits / stats.totalRequests) * 100 : 0,
            storageUsage: storageInfo.percent,
            isPersistent,
            recommendations: this.generateCacheRecommendations(stats, storageInfo)
        };
    },
    
    /**
     * Generates cache optimization recommendations
     */
    generateCacheRecommendations(stats, storageInfo) {
        const recommendations = [];
        
        if (stats.hitRate < 50) {
            recommendations.push({
                type: 'performance',
                message: 'Low cache hit rate. Consider preloading more critical resources.',
                action: 'preload-critical'
            });
        }
        
        if (storageInfo.percent > 80) {
            recommendations.push({
                type: 'storage',
                message: 'High storage usage. Consider clearing old cache data.',
                action: 'clear-old-caches'
            });
        }
        
        if (storageInfo.percent < 20) {
            recommendations.push({
                type: 'optimization',
                message: 'Low storage usage. Consider caching more resources for better performance.',
                action: 'increase-caching'
            });
        }
        
        if (!storageInfo.isPersistent) {
            recommendations.push({
                type: 'reliability',
                message: 'Storage is not persistent. Request persistent storage for better reliability.',
                action: 'request-persistent'
            });
        }
        
        return recommendations;
    },
    
    /**
     * Optimizes cache based on usage patterns
     */
    async optimizeCache(registration) {
        const performance = await this.getCachePerformance(registration);
        const results = { optimizations: [], errors: [] };
        
        for (const recommendation of performance.recommendations) {
            try {
                switch (recommendation.action) {
                    case 'clear-old-caches':
                        await this.clearOldCaches(registration);
                        results.optimizations.push('Cleared old caches');
                        break;
                        
                    case 'preload-critical':
                        await this.preloadCriticalResources(registration, this.getCriticalResources());
                        results.optimizations.push('Preloaded critical resources');
                        break;
                        
                    case 'request-persistent': {
                        const persistent = await this.requestPersistentStorage();
                        if (persistent.granted) {
                            results.optimizations.push('Enabled persistent storage');
                        }
                        break;
                    }
                        
                    default:
                        break;
                }
            } catch (error) {
                results.errors.push(`Failed to ${recommendation.action}: ${error.message}`);
            }
        }
        
        return results;
    },
    
    /**
     * Clears old/unused caches
     */
    async clearOldCaches(registration) {
        if (!registration?.active) {
            throw new Error('No active service worker');
        }
        
        try {
            const response = await this.postMessageToSW(registration, { type: 'CLEAR_OLD_CACHES' });
            return response?.clearedCaches || [];
        } catch (error) {
            throw new Error(`Failed to clear old caches: ${error.message}`);
        }
    },
    
    /**
     * Gets list of critical resources to cache
     */
    getCriticalResources() {
        return [
            '/',
            '/static/css/main.css',
            '/static/js/main.js',
            '/static/js/components/app.js',
            '/static/icons/icon-192x192.png',
            '/static/icons/icon-512x512.png'
        ];
    },
    
    /**
     * Posts message to service worker with response
     */
    async postMessageToSW(registration, message, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const messageChannel = new MessageChannel();
            const timeoutId = setTimeout(() => {
                reject(new Error('Service Worker response timeout'));
            }, timeout);
            
            messageChannel.port1.onmessage = (event) => {
                clearTimeout(timeoutId);
                resolve(event.data);
            };
            
            try {
                registration.active.postMessage(message, [messageChannel.port2]);
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    },
    
    /**
     * Monitors cache usage over time
     */
    startCacheMonitoring(registration, interval = 60000) {
        let monitoringData = {
            samples: [],
            startTime: Date.now()
        };
        
        const monitor = async () => {
            try {
                const stats = await this.getCacheStatistics(registration);
                const storage = await this.getStorageEstimate();
                
                monitoringData.samples.push({
                    timestamp: Date.now(),
                    hitRate: stats.hitRate,
                    storageUsage: storage.percent,
                    totalRequests: stats.totalRequests
                });
                
                // Keep only last 100 samples
                if (monitoringData.samples.length > 100) {
                    monitoringData.samples.shift();
                }
                
                // Dispatch monitoring event
                window.dispatchEvent(new CustomEvent('pwa-cache-monitoring', {
                    detail: monitoringData
                }));
                
            } catch (error) {
                if (window.DevLogger?.error) {
                    window.DevLogger.error('[PWA] Cache monitoring error:', error);
                }
            }
        };
        
        const intervalId = setInterval(monitor, interval);
        
        // Initial sample
        monitor();
        
        return {
            stop: () => {
                clearInterval(intervalId);
            },
            getData: () => monitoringData,
            reset: () => {
                monitoringData = { samples: [], startTime: Date.now() };
            }
        };
    },
    
    /**
     * Formats cache size for display
     */
    formatCacheSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    /**
     * Gets cache health score
     */
    calculateCacheHealth(stats, storageInfo) {
        let score = 100;
        
        // Reduce score for low hit rate
        if (stats.hitRate < 50) score -= 30;
        else if (stats.hitRate < 70) score -= 15;
        
        // Reduce score for high storage usage
        if (storageInfo.percent > 90) score -= 25;
        else if (storageInfo.percent > 80) score -= 10;
        
        // Reduce score for no persistent storage
        if (!storageInfo.isPersistent) score -= 10;
        
        return Math.max(0, Math.min(100, score));
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pwaCache };
} else if (typeof window !== 'undefined') {
    window.pwaCache = pwaCache;
}
