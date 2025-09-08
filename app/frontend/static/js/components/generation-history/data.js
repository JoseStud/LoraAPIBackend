/**
 * Generation History - Data Operations Module
 * 
 * Handles data loading, pagination, CRUD operations, and API interactions.
 */

/**
 * Data operations for generation history
 */
const generationHistoryData = {
    /**
     * Loads results from the API with pagination
     */
    async loadResults(page = 1, limit = 20) {
        try {
            const response = await fetch(`/api/v1/results?page=${page}&limit=${limit}`);
            if (!response.ok) throw new Error('Failed to load results');
            
            const data = await response.json();
            return {
                results: data.results || [],
                hasMore: data.has_more || false,
                total: data.total || 0
            };
            
        } catch (error) {
            throw new Error(`Failed to load results: ${error.message}`);
        }
    },
    
    /**
     * Loads a single result by ID
     */
    async loadResult(id) {
        try {
            const response = await fetch(`/api/v1/results/${id}`);
            if (!response.ok) throw new Error('Failed to load result');
            
            return await response.json();
            
        } catch (error) {
            throw new Error(`Failed to load result: ${error.message}`);
        }
    },
    
    /**
     * Updates a result's rating
     */
    async updateRating(resultId, rating) {
        try {
            const response = await fetch(`/api/v1/results/${resultId}/rating`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ rating })
            });
            
            if (!response.ok) throw new Error('Failed to update rating');
            
            return await response.json();
            
        } catch (error) {
            throw new Error(`Failed to update rating: ${error.message}`);
        }
    },
    
    /**
     * Toggles favorite status for a result
     */
    async updateFavorite(resultId, isFavorite) {
        try {
            const response = await fetch(`/api/v1/results/${resultId}/favorite`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ is_favorite: isFavorite })
            });
            
            if (!response.ok) throw new Error('Failed to update favorite status');
            
            return await response.json();
            
        } catch (error) {
            throw new Error(`Failed to update favorite: ${error.message}`);
        }
    },
    
    /**
     * Deletes multiple results
     */
    async deleteResults(ids) {
        try {
            const response = await fetch('/api/v1/results/bulk-delete', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids })
            });
            
            if (!response.ok) throw new Error('Failed to delete results');
            
            return await response.json();
            
        } catch (error) {
            throw new Error(`Failed to delete results: ${error.message}`);
        }
    },
    
    /**
     * Bulk update favorites
     */
    async bulkUpdateFavorites(ids, isFavorite) {
        try {
            const response = await fetch('/api/v1/results/bulk-favorite', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    ids, 
                    is_favorite: isFavorite 
                })
            });
            
            if (!response.ok) throw new Error('Failed to update favorites');
            
            return await response.json();
            
        } catch (error) {
            throw new Error(`Failed to update favorites: ${error.message}`);
        }
    },
    
    /**
     * Exports results
     */
    async exportResults(ids, format = 'zip') {
        try {
            const response = await fetch('/api/v1/results/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ids, format })
            });
            
            if (!response.ok) throw new Error('Failed to export results');
            
            // Handle file download
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `export_${new Date().toISOString().slice(0, 10)}.${format}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            return { success: true };
            
        } catch (error) {
            throw new Error(`Failed to export results: ${error.message}`);
        }
    },
    
    /**
     * Loads generation statistics
     */
    async loadStatistics() {
        try {
            const response = await fetch('/api/v1/results/statistics');
            if (!response.ok) throw new Error('Failed to load statistics');
            
            return await response.json();
            
        } catch (error) {
            throw new Error(`Failed to load statistics: ${error.message}`);
        }
    },
    
    /**
     * Calculates statistics from current results
     */
    calculateLocalStats(results) {
        if (!results || results.length === 0) {
            return {
                total_results: 0,
                avg_rating: 0,
                total_favorites: 0,
                total_size: 0
            };
        }
        
        const totalResults = results.length;
        const ratings = results.filter(r => r.rating > 0);
        const avgRating = ratings.length > 0 
            ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length 
            : 0;
        
        const totalFavorites = results.filter(r => r.is_favorite).length;
        const totalSize = results.reduce((sum, r) => sum + (r.file_size || 0), 0);
        
        return {
            total_results: totalResults,
            avg_rating: parseFloat(avgRating.toFixed(2)),
            total_favorites: totalFavorites,
            total_size: totalSize
        };
    },
    
    /**
     * Searches results with advanced filters
     */
    async searchResults(searchParams) {
        try {
            const queryParams = new URLSearchParams(searchParams);
            const response = await fetch(`/api/v1/results/search?${queryParams}`);
            
            if (!response.ok) throw new Error('Failed to search results');
            
            return await response.json();
            
        } catch (error) {
            throw new Error(`Failed to search results: ${error.message}`);
        }
    },
    
    /**
     * Gets available filter options
     */
    async getFilterOptions() {
        try {
            const response = await fetch('/api/v1/results/filter-options');
            if (!response.ok) throw new Error('Failed to load filter options');
            
            return await response.json();
            
        } catch (error) {
            // Return default options if API fails
            return {
                dimensions: ['512x512', '768x768', '1024x1024'],
                date_ranges: ['today', 'week', 'month', 'all'],
                rating_ranges: [1, 2, 3, 4, 5]
            };
        }
    },
    
    /**
     * Saves generation parameters for reuse
     */
    saveParametersForReuse(parameters) {
        try {
            localStorage.setItem('generation-reuse-params', JSON.stringify(parameters));
            return true;
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Gets saved generation parameters
     */
    getSavedParameters() {
        try {
            const saved = localStorage.getItem('generation-reuse-params');
            return saved ? JSON.parse(saved) : null;
        } catch (error) {
            return null;
        }
    },
    
    /**
     * Downloads a single result image
     */
    async downloadResult(result) {
        try {
            const response = await fetch(result.image_url);
            if (!response.ok) throw new Error('Failed to download image');
            
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `generation_${result.id}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            return { success: true };
            
        } catch (error) {
            throw new Error(`Failed to download image: ${error.message}`);
        }
    },
    
    /**
     * Validates result data before operations
     */
    validateResult(result) {
        const required = ['id', 'prompt', 'created_at'];
        const missing = required.filter(field => !result[field]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
        
        return true;
    },
    
    /**
     * Formats result data for display
     */
    formatResultForDisplay(result) {
        return {
            ...result,
            created_at_formatted: new Date(result.created_at).toLocaleString(),
            file_size_formatted: this.formatFileSize(result.file_size || 0),
            rating_display: result.rating || 0,
            is_favorite: Boolean(result.is_favorite)
        };
    },
    
    /**
     * Formats file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationHistoryData };
} else if (typeof window !== 'undefined') {
    window.generationHistoryData = generationHistoryData;
}
