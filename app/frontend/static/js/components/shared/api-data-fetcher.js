/**
 * Generic API Data Fetcher Component
 * Reusable Alpine.js component for handling API data fetching with loading states, errors, and pagination
 */


import { fetchData, postData, putData, deleteData } from '../../utils/api.js';

/**
 * Creates a generic data fetcher component that can be mixed into other Alpine.js components
 * @param {string} endpoint - The API endpoint to fetch data from
 * @param {object} options - Configuration options for the fetcher
 * @returns {object} Alpine.js component data object
 */
export default function apiDataFetcher(endpoint, options = {}) {
    const {
        // Default configuration
        initialData = null,
        autoFetch = true,
        paginated = false,
        pageSize = 50,
        transform = null, // Function to transform response data
        errorHandler = null, // Custom error handler
        successHandler = null, // Custom success handler
        retryAttempts = 3,
        retryDelay = 1000,
        cacheKey = null, // Cache key for localStorage
        cacheDuration = 300000, // 5 minutes default cache
        requiresAuth = true, // Whether to include authentication headers
        customHeaders = {}, // Additional custom headers
    } = options;

    const normalizeHeaders = (value) => {
        if (!value) return {};
        if (typeof Headers !== 'undefined' && value instanceof Headers) {
            return Object.fromEntries(value.entries());
        }
        return { ...value };
    };

    return {
        // Core data state
        data: initialData,
        originalData: null, // Store original unfiltered data
        isLoading: false,
        error: null,
        hasError: false,
        
        // Pagination state (when enabled)
        hasMore: true,
        currentPage: 1,
        totalItems: 0,
        pageSize: pageSize,
        
        // Request state
        lastFetchTime: null,
        retryCount: 0,
        abortController: null,

        /**
         * Build request headers with defaults and optional overrides
         * @param {object} extraHeaders
         */
        buildRequestHeaders(extraHeaders = {}) {
            const overrides = normalizeHeaders(extraHeaders);
            const merged = {
                'Content-Type': 'application/json',
                ...normalizeHeaders(customHeaders),
                ...overrides
            };

            if (requiresAuth) {
                const authHeaders = this.getAuthHeaders();
                Object.assign(merged, authHeaders);
            }

            if (merged['Content-Type'] === null || merged['Content-Type'] === undefined) {
                delete merged['Content-Type'];
            }

            return merged;
        },

        // Cache state
        cacheKey: cacheKey || `api_cache_${endpoint.replace(/[^a-zA-Z0-9]/g, '_')}`,
        
        /**
         * Initialize the component
         */
        init() {
            if (autoFetch) {
                this.fetchData();
            }
            
            // Call custom init if provided
            if (this.customInit) {
                this.customInit();
            }
        },

        /**
         * Main data fetching method
         * @param {boolean} reset - Whether to reset pagination and data
         * @param {object} customParams - Additional query parameters
         */
        async fetchData(reset = true, customParams = {}) {
            // Cancel any existing request
            if (this.abortController) {
                this.abortController.abort();
            }
            
            this.abortController = new AbortController();
            
            if (reset) {
                this.currentPage = 1;
                this.hasMore = true;
                this.error = null;
                this.hasError = false;
            }

            // Check cache first
            if (reset && this.shouldUseCache()) {
                const cachedData = this.getCachedData();
                if (cachedData) {
                    this.handleSuccessfulResponse(cachedData, false);
                    return cachedData;
                }
            }

            try {
                this.isLoading = true;
                this.retryCount = 0;
                
                const response = await this.makeRequest(customParams);
                const data = await this.handleSuccessfulResponse(response, true);
                
                return data;
                
            } catch (error) {
                if (error.name === 'AbortError') {
                    return; // Request was cancelled
                }
                
                await this.handleError(error);
                throw error;
            } finally {
                this.isLoading = false;
                this.abortController = null;
            }
        },

        /**
         * Make the actual HTTP request with retry logic
         * @param {object} customParams - Additional query parameters
         */
        async makeRequest(customParams = {}) {
            const params = new URLSearchParams({
                ...customParams
            });

            if (paginated) {
                params.set('page', this.currentPage);
                params.set('page_size', this.pageSize);
            }

            const url = `${endpoint}${params.toString() ? '?' + params.toString() : ''}`;
            
            for (let attempt = 0; attempt <= retryAttempts; attempt++) {
                try {

                    const headers = {
                        ...customHeaders
                    };
                    
                    // Add authentication headers if required
                    if (requiresAuth) {
                        const authHeaders = this.getAuthHeaders();
                        Object.assign(headers, authHeaders);
                    }
                    
                    // Use centralized fetchData with signal support
                    const options = {
                        signal: this.abortController?.signal,
                        headers
                    };
                    
                    return await fetchData(url, options);
                    

                } catch (error) {
                    if (error.name === 'AbortError' || attempt === retryAttempts) {
                        throw error;
                    }

                    this.retryCount = attempt + 1;
                    await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
                }
            }
        },

        /**
         * Handle successful response
         * @param {object} response - API response data
         * @param {boolean} updateCache - Whether to update cache
         */
        async handleSuccessfulResponse(response, updateCache = true) {
            let processedData = response;

            // Handle paginated responses
            if (paginated && response.results) {
                if (this.currentPage === 1) {
                    this.data = response.results;
                } else {
                    this.data = [...(this.data || []), ...response.results];
                }

                this.hasMore = response.has_more || false;
                this.totalItems = response.total || this.data.length;
                processedData = this.data;
            } else {
                this.data = response;
                processedData = response;
            }

            // Store original data for filtering
            if (this.currentPage === 1) {
                this.originalData = Array.isArray(processedData) ? [...processedData] : processedData;
            }

            // Apply custom transformation
            if (transform && typeof transform === 'function') {
                processedData = transform(processedData);
                this.data = processedData;
            }

            // Update cache
            if (updateCache && this.currentPage === 1) {
                this.updateCache(response);
            }

            // Update timestamp
            this.lastFetchTime = Date.now();

            // Call custom success handler and ensure it's executed with the
            // component's `this` context so handlers can safely reference
            // component methods/properties.
            if (successHandler && typeof successHandler === 'function') {
                try {
                    successHandler.call(this, processedData, response);
                } catch (e) {
                    // Don't break the fetch flow if a handler throws
                    window.DevLogger?.error?.('Success handler error:', e);
                }
            }

            return processedData;
        },

        /**
         * Handle errors with custom error handling
         * @param {Error} error - The error that occurred
         */
        async handleError(error) {
            this.error = error.message || 'An error occurred while fetching data';
            this.hasError = true;

            // Try custom error handler first
            if (errorHandler && typeof errorHandler === 'function') {
                const handled = await errorHandler(error, this);
                if (handled) return;
            }

            // Default error handling
            window.DevLogger?.error?.(`API Data Fetcher Error (${endpoint}):`, error);
            
            // Try to show notification if available
            try {
                const notifications = Alpine.store?.('notifications');
                if (notifications?.add) {
                    notifications.add(this.error, 'error');
                }
            } catch (e) {
                // Fallback to DevLogger if notifications not available
                window.DevLogger?.error?.('Failed to fetch data:', this.error);
            }
        },

        /**
         * Load more data (for pagination)
         * @param {object} customParams - Additional query parameters
         */
        async loadMore(customParams = {}) {
            if (!paginated || !this.hasMore || this.isLoading) {
                return;
            }

            this.currentPage++;
            return await this.fetchData(false, customParams);
        },

        /**
         * Refresh data (reset and fetch)
         * @param {object} customParams - Additional query parameters
         */
        async refresh(customParams = {}) {
            this.clearCache();
            return await this.fetchData(true, customParams);
        },

        /**
         * Make a request with a specific HTTP method (POST, PUT, DELETE, etc.)
         * @param {string} method - HTTP method (POST, PUT, DELETE, etc.)
         * @param {object} data - Request body data
         * @param {object} options - Additional options
         */
        async makeHttpRequest(method = 'GET', data = null, requestOptions = {}) {
            const methodUpper = typeof method === 'string' ? method.toUpperCase() : 'GET';
            const optionsWithoutReturnResponse = { ...requestOptions };
            delete optionsWithoutReturnResponse.returnResponse;

            const {
                customEndpoint = null,
                customParams = {},
                customHeaders: requestHeaders = {},
                parseResponse: customParseResponse,
                headers: overrideHeaders,
                body: overrideBody,
                ...restOptions
            } = optionsWithoutReturnResponse;

            const baseUrl = customEndpoint || endpoint;
            const params = new URLSearchParams(customParams);
            const url = `${baseUrl}${params.toString() ? '?' + params.toString() : ''}`;

            try {

                const headers = {
                    ...customHeaders,
                    ...requestHeaders
                };
                
                // Add authentication headers if required
                if (requiresAuth) {
                    const authHeaders = this.getAuthHeaders();
                    Object.assign(headers, authHeaders);
                }
                
                const options = { headers };
                
                // Use appropriate centralized API function based on method
                switch (method.toUpperCase()) {
                    case 'POST':
                        return await postData(url, data, options);
                    case 'PUT':
                        return await putData(url, data, options);
                    case 'DELETE':
                        return await deleteData(url, options);
                    case 'GET':
                    default:
                        return await fetchData(url, options);
                }

            } catch (error) {
                window.DevLogger?.error?.(`HTTP Request failed (${methodUpper} ${url}):`, error);
                throw error;
            }
        },

        /**
         * Get authentication headers
         */
        getAuthHeaders() {
            const headers = {};
            const apiKey = localStorage.getItem('lora_manager_api_key');
            if (apiKey) {
                headers['X-API-Key'] = apiKey;
            }
            return headers;
        },

        /**
         * Cache management methods
         */
        shouldUseCache() {
            if (!cacheKey) return false;
            
            const cached = localStorage.getItem(this.cacheKey);
            if (!cached) return false;
            
            try {
                const { timestamp } = JSON.parse(cached);
                return Date.now() - timestamp < cacheDuration;
            } catch {
                return false;
            }
        },

        getCachedData() {
            try {
                const cached = localStorage.getItem(this.cacheKey);
                if (!cached) return null;
                
                const { data } = JSON.parse(cached);
                return data;
            } catch {
                return null;
            }
        },

        updateCache(data) {
            if (!cacheKey) return;
            
            try {
                localStorage.setItem(this.cacheKey, JSON.stringify({
                    data,
                    timestamp: Date.now()
                }));
            } catch (error) {
                window.DevLogger?.warn?.('Failed to cache data:', error);
            }
        },

        clearCache() {

            if (this.cacheKey) {

                localStorage.removeItem(this.cacheKey);
            }
        },

        /**
         * Utility methods
         */
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        /**
         * Check if data is currently being fetched
         */
        get isFetching() {
            return this.isLoading;
        },

        /**
         * Check if data is available
         */
        get hasData() {
            return this.data !== null && this.data !== undefined;
        },

        /**
         * Get current data count
         */
        get dataCount() {
            if (Array.isArray(this.data)) {
                return this.data.length;
            }
            return this.hasData ? 1 : 0;
        },

        /**
         * Cleanup method to cancel ongoing requests
         */
        destroy() {
            if (this.abortController) {
                this.abortController.abort();
            }
        }
    };
}

/**
 * Factory function for creating paginated data fetchers
 * @param {string} endpoint - API endpoint
 * @param {object} options - Additional options
 */
export function createPaginatedFetcher(endpoint, options = {}) {
    return apiDataFetcher(endpoint, {
        ...options,
        paginated: true
    });
}

/**
 * Factory function for creating simple data fetchers
 * @param {string} endpoint - API endpoint
 * @param {object} options - Additional options
 */
export function createSimpleFetcher(endpoint, options = {}) {
    return apiDataFetcher(endpoint, {
        ...options,
        paginated: false
    });
}
