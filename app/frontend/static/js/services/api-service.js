/**
 * Centralized API Service
 * Handles all HTTP requests with consistent error handling and response formatting
 */

class APIService {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.defaultHeaders = {
            'Content-Type': 'application/json'
        };
    }

    /**
     * Generic request method with error handling
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        
        // Add API key if available
        const headers = { ...this.defaultHeaders };
        const apiKey = localStorage.getItem('lora_manager_api_key');
        if (apiKey) {
            headers['X-API-Key'] = apiKey;
        }
        
        const config = {
            headers: { ...headers, ...options.headers },
            ...options
        };

        try {
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Handle different content types
            const contentType = response.headers.get('content-type');
            if (contentType?.includes('application/json')) {
                return await response.json();
            } else if (contentType?.includes('text/')) {
                return await response.text();
            } else {
                return response;
            }
        } catch (error) {
            window.DevLogger?.error?.('API Request failed:', { url, error });
            throw error;
        }
    }

    // Convenience methods
    async get(endpoint, params = {}) {
        const queryString = new URLSearchParams(params).toString();
        const url = queryString ? `${endpoint}?${queryString}` : endpoint;
        return this.request(url, { method: 'GET' });
    }

    async post(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async put(endpoint, data = {}) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    }

    // Specific API endpoints
    async getAdapters(params = {}) {
        return this.get('/api/adapters', params);
    }

    async getAdapterTags() {
        return this.get('/api/adapters/tags');
    }

    async getDashboardStats() {
        return this.get('/api/dashboard/stats');
    }

    async getResults(params = {}) {
        return this.get('/api/results', params);
    }

    async updateResultRating(resultId, rating) {
        return this.put(`/api/results/${resultId}/rating`, { rating });
    }

    async toggleResultFavorite(resultId, isFavorite) {
        return this.put(`/api/results/${resultId}/favorite`, { is_favorite: isFavorite });
    }

    async deleteResult(resultId) {
        return this.delete(`/api/results/${resultId}`);
    }

    async bulkDeleteResults(ids) {
        return this.request('/api/results/bulk-delete', {
            method: 'DELETE',
            body: JSON.stringify({ ids })
        });
    }

    async bulkFavoriteResults(ids, isFavorite = true) {
        return this.put('/api/results/bulk-favorite', { 
            ids, 
            is_favorite: isFavorite 
        });
    }

    async exportResults(ids) {
        return this.request('/api/results/export', {
            method: 'POST',
            body: JSON.stringify({ ids })
        });
    }

    async computeEmbeddings(loraIds, forceRecompute = false) {
        return this.post('/api/recommendations/embeddings/compute', {
            lora_ids: loraIds,
            force_recompute: forceRecompute
        });
    }

    async rebuildIndex() {
        return this.post('/api/recommendations/index/rebuild');
    }

    async getActiveJobs(status = 'processing') {
        return this.get('/api/deliveries/jobs', { status });
    }
}

// Export singleton instance
window.APIService = new APIService();
