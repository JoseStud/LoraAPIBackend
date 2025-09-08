/**
 * Generation Studio - Results Management Module
 * 
 * Handles result display, management, and interaction operations.
 */

/**
 * Results management for generation studio
 */
const generationResults = {
    /**
     * Formats a result for display
     */
    formatResult(result) {
        if (!result) return null;
        
        return {
            id: result.id,
            job_id: result.job_id,
            prompt: result.prompt || '',
            negative_prompt: result.negative_prompt || '',
            image_url: result.image_url,
            thumbnail_url: result.thumbnail_url || result.image_url,
            width: result.width || 512,
            height: result.height || 512,
            steps: result.steps || 20,
            cfg_scale: result.cfg_scale || 7.0,
            seed: result.seed || -1,
            batch_count: result.batch_count || 1,
            batch_size: result.batch_size || 1,
            created_at: result.created_at,
            file_size: result.file_size || 0,
            generation_time: result.generation_time || 0,
            model_used: result.model_used || 'Unknown',
            user_id: result.user_id,
            rating: result.rating || 0,
            tags: Array.isArray(result.tags) ? result.tags : [],
            metadata: result.metadata || {}
        };
    },
    
    /**
     * Formats file size for display
     */
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '—';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        const threshold = 1024;
        
        let size = bytes;
        let unitIndex = 0;
        
        while (size >= threshold && unitIndex < units.length - 1) {
            size /= threshold;
            unitIndex++;
        }
        
        return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    },
    
    /**
     * Formats generation time for display
     */
    formatGenerationTime(seconds) {
        if (!seconds || seconds <= 0) return '—';
        
        if (seconds < 60) {
            return `${seconds.toFixed(1)}s`;
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
    
    /**
     * Formats date for display
     */
    formatDate(dateString) {
        if (!dateString) return '—';
        
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffHours = diffMs / (1000 * 60 * 60);
            
            if (diffHours < 1) {
                const diffMinutes = Math.floor(diffMs / (1000 * 60));
                return `${diffMinutes}m ago`;
            } else if (diffHours < 24) {
                return `${Math.floor(diffHours)}h ago`;
            } else if (diffHours < 72) {
                const diffDays = Math.floor(diffHours / 24);
                return `${diffDays}d ago`;
            } else {
                return date.toLocaleDateString();
            }
        } catch (error) {
            return '—';
        }
    },
    
    /**
     * Gets aspect ratio for result
     */
    getAspectRatio(result) {
        if (!result || !result.width || !result.height) {
            return 'Unknown';
        }
        
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        const divisor = gcd(result.width, result.height);
        const widthRatio = result.width / divisor;
        const heightRatio = result.height / divisor;
        
        // Common aspect ratios
        const commonRatios = {
            '1:1': [1, 1],
            '4:3': [4, 3],
            '3:2': [3, 2],
            '16:9': [16, 9],
            '9:16': [9, 16],
            '2:3': [2, 3],
            '3:4': [3, 4]
        };
        
        for (const [ratio, [w, h]] of Object.entries(commonRatios)) {
            if (widthRatio === w && heightRatio === h) {
                return ratio;
            }
        }
        
        return `${widthRatio}:${heightRatio}`;
    },
    
    /**
     * Gets resolution category
     */
    getResolutionCategory(result) {
        if (!result || !result.width || !result.height) {
            return 'Unknown';
        }
        
        const pixels = result.width * result.height;
        
        if (pixels <= 512 * 512) {
            return 'Low (≤512²)';
        } else if (pixels <= 768 * 768) {
            return 'Medium (≤768²)';
        } else if (pixels <= 1024 * 1024) {
            return 'High (≤1024²)';
        } else {
            return 'Ultra (>1024²)';
        }
    },
    
    /**
     * Creates parameters object from result for reuse
     */
    extractParameters(result) {
        if (!result) return null;
        
        return {
            prompt: result.prompt || '',
            negative_prompt: result.negative_prompt || '',
            width: result.width || 512,
            height: result.height || 512,
            steps: result.steps || 20,
            cfg_scale: result.cfg_scale || 7.0,
            seed: result.seed || -1,
            batch_count: result.batch_count || 1,
            batch_size: result.batch_size || 1,
            sampler: result.metadata?.sampler,
            scheduler: result.metadata?.scheduler,
            model: result.model_used
        };
    },
    
    /**
     * Validates result data
     */
    validateResult(result) {
        const errors = [];
        
        if (!result) {
            errors.push('Result is null or undefined');
            return { isValid: false, errors };
        }
        
        if (!result.id) {
            errors.push('Result ID is missing');
        }
        
        if (!result.image_url) {
            errors.push('Image URL is missing');
        }
        
        if (!result.prompt) {
            errors.push('Prompt is missing');
        }
        
        if (!result.width || !result.height) {
            errors.push('Dimensions are missing');
        }
        
        if (!result.created_at) {
            errors.push('Creation date is missing');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    },
    
    /**
     * Filters results based on criteria
     */
    filterResults(results, filters = {}) {
        if (!Array.isArray(results)) return [];
        
        return results.filter(result => {
            // Search text filter
            if (filters.search) {
                const searchText = filters.search.toLowerCase();
                const prompt = (result.prompt || '').toLowerCase();
                const tags = (result.tags || []).join(' ').toLowerCase();
                
                if (!prompt.includes(searchText) && !tags.includes(searchText)) {
                    return false;
                }
            }
            
            // Rating filter
            if (filters.minRating && result.rating < filters.minRating) {
                return false;
            }
            
            // Resolution filter
            if (filters.resolution) {
                const category = this.getResolutionCategory(result);
                if (category !== filters.resolution) {
                    return false;
                }
            }
            
            // Aspect ratio filter
            if (filters.aspectRatio) {
                const ratio = this.getAspectRatio(result);
                if (ratio !== filters.aspectRatio) {
                    return false;
                }
            }
            
            // Model filter
            if (filters.model && result.model_used !== filters.model) {
                return false;
            }
            
            // Date range filter
            if (filters.dateFrom || filters.dateTo) {
                const resultDate = new Date(result.created_at);
                
                if (filters.dateFrom && resultDate < new Date(filters.dateFrom)) {
                    return false;
                }
                
                if (filters.dateTo && resultDate > new Date(filters.dateTo)) {
                    return false;
                }
            }
            
            // Tags filter
            if (filters.tags && filters.tags.length > 0) {
                const resultTags = result.tags || [];
                const hasMatchingTag = filters.tags.some(tag => 
                    resultTags.some(resultTag => 
                        resultTag.toLowerCase().includes(tag.toLowerCase())
                    )
                );
                
                if (!hasMatchingTag) {
                    return false;
                }
            }
            
            return true;
        });
    },
    
    /**
     * Sorts results based on criteria
     */
    sortResults(results, sortBy = 'created_at', sortOrder = 'desc') {
        if (!Array.isArray(results)) return [];
        
        const sortedResults = [...results];
        
        sortedResults.sort((a, b) => {
            let valueA, valueB;
            
            switch (sortBy) {
                case 'created_at':
                    valueA = new Date(a.created_at || 0);
                    valueB = new Date(b.created_at || 0);
                    break;
                    
                case 'rating':
                    valueA = a.rating || 0;
                    valueB = b.rating || 0;
                    break;
                    
                case 'generation_time':
                    valueA = a.generation_time || 0;
                    valueB = b.generation_time || 0;
                    break;
                    
                case 'file_size':
                    valueA = a.file_size || 0;
                    valueB = b.file_size || 0;
                    break;
                    
                case 'resolution':
                    valueA = (a.width || 0) * (a.height || 0);
                    valueB = (b.width || 0) * (b.height || 0);
                    break;
                    
                case 'steps':
                    valueA = a.steps || 0;
                    valueB = b.steps || 0;
                    break;
                    
                case 'cfg_scale':
                    valueA = a.cfg_scale || 0;
                    valueB = b.cfg_scale || 0;
                    break;
                    
                default:
                    valueA = a[sortBy] || '';
                    valueB = b[sortBy] || '';
            }
            
            if (valueA < valueB) return sortOrder === 'asc' ? -1 : 1;
            if (valueA > valueB) return sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
        
        return sortedResults;
    },
    
    /**
     * Gets unique values for filtering
     */
    getUniqueValues(results, field) {
        if (!Array.isArray(results)) return [];
        
        const values = new Set();
        
        results.forEach(result => {
            let value;
            
            switch (field) {
                case 'model':
                    value = result.model_used;
                    break;
                case 'resolution':
                    value = this.getResolutionCategory(result);
                    break;
                case 'aspectRatio':
                    value = this.getAspectRatio(result);
                    break;
                case 'tags':
                    if (Array.isArray(result.tags)) {
                        result.tags.forEach(tag => values.add(tag));
                    }
                    return;
                default:
                    value = result[field];
            }
            
            if (value && value !== 'Unknown') {
                values.add(value);
            }
        });
        
        return Array.from(values).sort();
    },
    
    /**
     * Creates gallery layout configuration
     */
    createGalleryLayout(results, viewMode = 'grid', columns = 3) {
        if (!Array.isArray(results)) return { items: [], layout: {} };
        
        const layout = {
            viewMode,
            columns,
            itemsPerPage: viewMode === 'grid' ? columns * 4 : 10,
            aspectRatio: '1:1'
        };
        
        const items = results.map((result, index) => {
            const formatted = this.formatResult(result);
            
            return {
                ...formatted,
                index,
                displayText: this.createDisplayText(formatted, viewMode),
                thumbnailUrl: formatted.thumbnail_url || formatted.image_url,
                aspectRatio: this.getAspectRatio(formatted)
            };
        });
        
        return { items, layout };
    },
    
    /**
     * Creates display text for result
     */
    createDisplayText(result, viewMode) {
        if (viewMode === 'list') {
            return {
                title: this.truncateText(result.prompt, 50),
                subtitle: `${result.width}×${result.height} • ${this.formatDate(result.created_at)}`,
                details: `${result.steps} steps • CFG ${result.cfg_scale} • ${this.formatGenerationTime(result.generation_time)}`
            };
        }
        
        return {
            title: this.truncateText(result.prompt, 30),
            subtitle: `${result.width}×${result.height}`
        };
    },
    
    /**
     * Truncates text to specified length
     */
    truncateText(text, maxLength) {
        if (!text || text.length <= maxLength) return text;
        return text.substring(0, maxLength - 3) + '...';
    },
    
    /**
     * Creates result statistics
     */
    getResultStatistics(results) {
        if (!Array.isArray(results) || results.length === 0) {
            return {
                total: 0,
                averageRating: 0,
                averageGenerationTime: 0,
                totalFileSize: 0,
                resolutionDistribution: {},
                modelDistribution: {},
                aspectRatioDistribution: {}
            };
        }
        
        const stats = {
            total: results.length,
            averageRating: 0,
            averageGenerationTime: 0,
            totalFileSize: 0,
            resolutionDistribution: {},
            modelDistribution: {},
            aspectRatioDistribution: {}
        };
        
        let totalRating = 0;
        let totalGenerationTime = 0;
        let ratedResults = 0;
        let timedResults = 0;
        
        results.forEach(result => {
            // Rating statistics
            if (result.rating && result.rating > 0) {
                totalRating += result.rating;
                ratedResults++;
            }
            
            // Generation time statistics
            if (result.generation_time && result.generation_time > 0) {
                totalGenerationTime += result.generation_time;
                timedResults++;
            }
            
            // File size
            if (result.file_size) {
                stats.totalFileSize += result.file_size;
            }
            
            // Resolution distribution
            const resolution = this.getResolutionCategory(result);
            stats.resolutionDistribution[resolution] = (stats.resolutionDistribution[resolution] || 0) + 1;
            
            // Model distribution
            const model = result.model_used || 'Unknown';
            stats.modelDistribution[model] = (stats.modelDistribution[model] || 0) + 1;
            
            // Aspect ratio distribution
            const aspectRatio = this.getAspectRatio(result);
            stats.aspectRatioDistribution[aspectRatio] = (stats.aspectRatioDistribution[aspectRatio] || 0) + 1;
        });
        
        if (ratedResults > 0) {
            stats.averageRating = totalRating / ratedResults;
        }
        
        if (timedResults > 0) {
            stats.averageGenerationTime = totalGenerationTime / timedResults;
        }
        
        return stats;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationResults };
} else if (typeof window !== 'undefined') {
    window.generationResults = generationResults;
}
