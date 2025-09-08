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
        return this.get('/api/v1/adapters', params);
    }

    async getAdapterTags() {
        return this.get('/api/v1/adapters/tags');
    }

    async getDashboardStats() {
        return this.get('/api/dashboard/stats');
    }

    async getResults(params = {}) {
        return this.get('/api/v1/results', params);
    }

    async updateResultRating(resultId, rating) {
        return this.put(`/api/v1/results/${resultId}/rating`, { rating });
    }

    async toggleResultFavorite(resultId, isFavorite) {
        return this.put(`/api/v1/results/${resultId}/favorite`, { is_favorite: isFavorite });
    }

    async deleteResult(resultId) {
        return this.delete(`/api/v1/results/${resultId}`);
    }

    async bulkDeleteResults(ids) {
        return this.request('/api/v1/results/bulk-delete', {
            method: 'DELETE',
            body: JSON.stringify({ ids })
        });
    }

    async bulkFavoriteResults(ids, isFavorite = true) {
        return this.put('/api/v1/results/bulk-favorite', { 
            ids, 
            is_favorite: isFavorite 
        });
    }

    async exportResults(ids) {
        return this.request('/api/v1/results/export', {
            method: 'POST',
            body: JSON.stringify({ ids })
        });
    }

    async computeEmbeddings(loraIds, forceRecompute = false) {
        return this.post('/api/v1/recommendations/embeddings/compute', {
            lora_ids: loraIds,
            force_recompute: forceRecompute
        });
    }

    async rebuildIndex() {
        return this.post('/api/v1/recommendations/index/rebuild');
    }

    async getActiveJobs(status = 'processing') {
        return this.get('/api/v1/deliveries/jobs', { status });
    }
}

// Export singleton instance
window.APIService = new APIService();
