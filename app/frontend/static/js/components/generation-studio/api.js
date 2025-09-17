/**
 * Generation Studio - API Operations Module
 * 
 * Handles all API communications for data loading and generation requests.
 */

import { fetchData, postData, deleteData } from '../../utils/api.js';

/**
 * API operations for generation studio
 */
const generationAPI = {
    /**
     * Base configuration for API requests
     */
    config: {
        baseUrl: '/api/v1',
        timeout: 30000,
        retries: 3,
        retryDelay: 1000
    },
    
    /**
     * Loads system status
     */
    async loadSystemStatus() {
        try {
            const data = await fetchData(`${this.config.baseUrl}/system/status`);
            
            return {
                success: true,
                data: {
                    status: data.status || 'unknown',
                    memoryUsage: data.memory_usage || {},
                    gpuUsage: data.gpu_usage || {},
                    diskUsage: data.disk_usage || {},
                    queueLength: data.queue_length || 0,
                    activeWorkers: data.active_workers || 0,
                    systemLoad: data.system_load || {},
                    uptime: data.uptime || 0,
                    version: data.version || 'unknown',
                    timestamp: Date.now()
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    },
    
    /**
     * Loads active generation jobs
     * NOTE: /generation/jobs/active endpoint doesn't exist yet in backend
     * Using deliveries API as fallback
     */
    async loadActiveJobs() {
        try {
            // TODO: Implement proper /generation/jobs/active endpoint in backend
            // For now return empty array as this endpoint doesn't exist
            if (window.DevLogger && window.DevLogger.warn) {
                window.DevLogger.warn('loadActiveJobs: /generation/jobs/active endpoint not implemented in backend');
            }
            
            return {
                success: true,
                data: []
            };
        } catch (error) {
            if (window.DevLogger && window.DevLogger.error) {
                window.DevLogger.error('Failed to load active jobs:', error);
            }
            
            return {
                success: false,
                error: error.message,
                data: []
            };
        } catch (error) {
            if (window.DevLogger && window.DevLogger.error) {
                window.DevLogger.error('Failed to load active jobs:', error);
            }
            
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    },
    
    /**
     * Loads recent generation results
     */
    async loadRecentResults(limit = 10) {
        try {
            const data = await fetchData(`${this.config.baseUrl}/generation/results?limit=${limit}&sort=created_at:desc`);
            
            return {
                success: true,
                data: Array.isArray(data) ? data.map(result => ({
                    id: result.id,
                    job_id: result.job_id,
                    prompt: result.prompt,
                    negative_prompt: result.negative_prompt,
                    image_url: result.image_url,
                    thumbnail_url: result.thumbnail_url,
                    width: result.width,
                    height: result.height,
                    steps: result.steps,
                    cfg_scale: result.cfg_scale,
                    seed: result.seed,
                    batch_count: result.batch_count,
                    batch_size: result.batch_size,
                    created_at: result.created_at,
                    file_size: result.file_size,
                    generation_time: result.generation_time,
                    model_used: result.model_used,
                    user_id: result.user_id,
                    rating: result.rating,
                    tags: result.tags || []
                })) : []
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    },
    
    /**
     * Starts a new generation
     */
    async startGeneration(params) {
        try {
            const validatedParams = this.validateGenerationParams(params);
            
            const data = await postData(`${this.config.baseUrl}/generation/generate`, validatedParams);
            
            return {
                success: true,
                data: {
                    job_id: data.job_id,
                    status: data.status,
                    estimated_time: data.estimated_time,
                    queue_position: data.queue_position,
                    message: data.message
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    },
    
    /**
     * Validates generation parameters
     */
    validateGenerationParams(params) {
        const validated = {};
        
        // Required parameters
        if (!params.prompt || !params.prompt.trim()) {
            throw new Error('Prompt is required');
        }
        validated.prompt = params.prompt.trim();
        
        // Optional parameters with defaults and validation
        validated.negative_prompt = (params.negative_prompt || '').trim();
        
        validated.width = this.validateDimension(params.width, 512);
        validated.height = this.validateDimension(params.height, 512);
        validated.steps = this.validateSteps(params.steps, 20);
        validated.cfg_scale = this.validateCfgScale(params.cfg_scale, 7.0);
        validated.seed = this.validateSeed(params.seed, -1);
        validated.batch_count = this.validateBatchCount(params.batch_count, 1);
        validated.batch_size = this.validateBatchSize(params.batch_size, 1);
        
        // Optional advanced parameters
        if (params.sampler) {
            validated.sampler = params.sampler;
        }
        if (params.scheduler) {
            validated.scheduler = params.scheduler;
        }
        if (params.model) {
            validated.model = params.model;
        }
        
        return validated;
    },
    
    /**
     * Validates dimension (width/height)
     */
    validateDimension(value, defaultValue) {
        const num = Number(value);
        if (isNaN(num) || num < 64 || num > 2048 || num % 8 !== 0) {
            return defaultValue;
        }
        return num;
    },
    
    /**
     * Validates steps parameter
     */
    validateSteps(value, defaultValue) {
        const num = Number(value);
        if (isNaN(num) || num < 1 || num > 150) {
            return defaultValue;
        }
        return num;
    },
    
    /**
     * Validates CFG scale parameter
     */
    validateCfgScale(value, defaultValue) {
        const num = Number(value);
        if (isNaN(num) || num < 1 || num > 30) {
            return defaultValue;
        }
        return num;
    },
    
    /**
     * Validates seed parameter
     */
    validateSeed(value, defaultValue) {
        const num = Number(value);
        if (isNaN(num) || !Number.isInteger(num)) {
            return defaultValue;
        }
        return num;
    },
    
    /**
     * Validates batch count parameter
     */
    validateBatchCount(value, defaultValue) {
        const num = Number(value);
        if (isNaN(num) || num < 1 || num > 10) {
            return defaultValue;
        }
        return num;
    },
    
    /**
     * Validates batch size parameter
     */
    validateBatchSize(value, defaultValue) {
        const num = Number(value);
        if (isNaN(num) || num < 1 || num > 4) {
            return defaultValue;
        }
        return num;
    },
    
    /**
     * Cancels a generation job
     */
    async cancelJob(jobId) {
        try {
            const data = await postData(`${this.config.baseUrl}/generation/jobs/${jobId}/cancel`, {});
            
            return {
                success: true,
                data: {
                    job_id: jobId,
                    status: data.status,
                    message: data.message
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    },
    
    /**
     * Deletes a generation result
     */
    async deleteResult(resultId) {
        try {
            await deleteData(`${this.config.baseUrl}/generation/results/${resultId}`);
            
            return {
                success: true,
                data: {
                    result_id: resultId,
                    message: 'Result deleted successfully'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    },
    
    /**
     * Gets available models
     */
    async getAvailableModels() {
        try {
            const data = await fetchData(`${this.config.baseUrl}/models/available`);
            
            return {
                success: true,
                data: Array.isArray(data) ? data.map(model => ({
                    id: model.id,
                    name: model.name,
                    type: model.type,
                    description: model.description,
                    tags: model.tags || [],
                    size: model.size,
                    loaded: model.loaded || false,
                    default: model.default || false
                })) : []
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: []
            };
        }
    },
    
    /**
     * Gets generation queue information
     */
    async getQueueInfo() {
        try {
            const data = await fetchData(`${this.config.baseUrl}/generation/queue/info`);
            
            return {
                success: true,
                data: {
                    length: data.length || 0,
                    processing: data.processing || 0,
                    estimated_wait: data.estimated_wait || 0,
                    active_workers: data.active_workers || 0,
                    throughput: data.throughput || 0
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    },
    
    /**
     * Updates generation result rating
     */
    async rateResult(resultId, rating) {
        try {
            const data = await postData(`${this.config.baseUrl}/generation/results/${resultId}/rate`, { rating: Number(rating) });
            
            return {
                success: true,
                data: {
                    result_id: resultId,
                    rating: data.rating,
                    message: 'Rating updated successfully'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    },
    
    /**
     * Adds tags to a generation result
     */
    async tagResult(resultId, tags) {
        try {
            const data = await postData(`${this.config.baseUrl}/generation/results/${resultId}/tags`, { tags: Array.isArray(tags) ? tags : [tags] });
            
            return {
                success: true,
                data: {
                    result_id: resultId,
                    tags: data.tags,
                    message: 'Tags updated successfully'
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    },
    
    /**
     * Gets generation statistics
     */
    async getGenerationStats(timeRange = '24h') {
        try {
            const data = await fetchData(`${this.config.baseUrl}/generation/stats?range=${timeRange}`);
            
            return {
                success: true,
                data: {
                    total_generations: data.total_generations || 0,
                    successful_generations: data.successful_generations || 0,
                    failed_generations: data.failed_generations || 0,
                    average_time: data.average_time || 0,
                    popular_prompts: data.popular_prompts || [],
                    model_usage: data.model_usage || {},
                    hourly_distribution: data.hourly_distribution || []
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    },
    
    /**
     * Downloads a generation result
     */
    async downloadResult(resultId, format = 'original') {
        try {
            // Use raw fetch for blob downloads as utils/api.js doesn't handle blobs
            const response = await fetch(`${this.config.baseUrl}/generation/results/${resultId}/download?format=${format}`, {
                method: 'GET',
                headers: {}  // Don't set Content-Type for downloads
            });
            
            if (response.ok) {
                const blob = await response.blob();
                const filename = response.headers.get('content-disposition')?.split('filename=')[1] || `result_${resultId}.png`;
                
                return {
                    success: true,
                    data: {
                        blob,
                        filename: filename.replace(/"/g, ''),
                        size: blob.size,
                        type: blob.type
                    }
                };
            } else {
                throw new Error(`Download failed: ${response.status}`);
            }
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationAPI };
} else if (typeof window !== 'undefined') {
    window.generationAPI = generationAPI;
}

export { generationAPI };
