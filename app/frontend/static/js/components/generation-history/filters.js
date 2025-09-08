/**
 * Generation History - Filtering & Search Module
 * 
 * Handles filtering logic, search functionality, and sorting operations.
 */

/**
 * Filtering and search operations for generation history
 */
const generationHistoryFilters = {
    /**
     * Applies all active filters to the results
     */
    applyFilters(results, filters) {
        if (!results || !Array.isArray(results)) return [];
        
        let filtered = [...results];
        
        // Apply search filter
        if (filters.searchTerm && filters.searchTerm.trim()) {
            filtered = this.applySearchFilter(filtered, filters.searchTerm);
        }
        
        // Apply date filter
        if (filters.dateFilter && filters.dateFilter !== 'all') {
            filtered = this.applyDateFilter(filtered, filters.dateFilter);
        }
        
        // Apply rating filter
        if (filters.ratingFilter && filters.ratingFilter > 0) {
            filtered = this.applyRatingFilter(filtered, filters.ratingFilter);
        }
        
        // Apply dimension filter
        if (filters.dimensionFilter && filters.dimensionFilter !== 'all') {
            filtered = this.applyDimensionFilter(filtered, filters.dimensionFilter);
        }
        
        // Apply sorting
        if (filters.sortBy) {
            filtered = this.applySorting(filtered, filters.sortBy);
        }
        
        return filtered;
    },
    
    /**
     * Applies search filter to results
     */
    applySearchFilter(results, searchTerm) {
        const searchLower = searchTerm.toLowerCase().trim();
        
        return results.filter(result => {
            // Search in prompt
            if (result.prompt && result.prompt.toLowerCase().includes(searchLower)) {
                return true;
            }
            
            // Search in negative prompt
            if (result.negative_prompt && result.negative_prompt.toLowerCase().includes(searchLower)) {
                return true;
            }
            
            // Search in LoRA names
            if (result.loras && Array.isArray(result.loras)) {
                const loraMatch = result.loras.some(lora => 
                    lora.name && lora.name.toLowerCase().includes(searchLower)
                );
                if (loraMatch) return true;
            }
            
            // Search in metadata tags
            if (result.metadata && result.metadata.tags && Array.isArray(result.metadata.tags)) {
                const tagMatch = result.metadata.tags.some(tag => 
                    tag.toLowerCase().includes(searchLower)
                );
                if (tagMatch) return true;
            }
            
            return false;
        });
    },
    
    /**
     * Applies date filter to results
     */
    applyDateFilter(results, dateFilter) {
        const now = new Date();
        const filterDate = new Date();
        
        switch (dateFilter) {
            case 'today':
                filterDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                filterDate.setDate(now.getDate() - 7);
                break;
            case 'month':
                filterDate.setMonth(now.getMonth() - 1);
                break;
            case 'year':
                filterDate.setFullYear(now.getFullYear() - 1);
                break;
            default:
                return results; // 'all' or unknown filter
        }
        
        return results.filter(result => {
            const resultDate = new Date(result.created_at);
            return resultDate >= filterDate;
        });
    },
    
    /**
     * Applies rating filter to results
     */
    applyRatingFilter(results, minRating) {
        return results.filter(result => {
            const rating = result.rating || 0;
            return rating >= minRating;
        });
    },
    
    /**
     * Applies dimension filter to results
     */
    applyDimensionFilter(results, dimensionFilter) {
        if (!dimensionFilter.includes('x')) return results;
        
        const [width, height] = dimensionFilter.split('x').map(Number);
        
        return results.filter(result => {
            return result.width === width && result.height === height;
        });
    },
    
    /**
     * Applies sorting to results
     */
    applySorting(results, sortBy) {
        const sortedResults = [...results];
        
        switch (sortBy) {
            case 'created_at':
                return sortedResults.sort((a, b) => 
                    new Date(b.created_at) - new Date(a.created_at)
                );
                
            case 'created_at_asc':
                return sortedResults.sort((a, b) => 
                    new Date(a.created_at) - new Date(b.created_at)
                );
                
            case 'rating':
                return sortedResults.sort((a, b) => 
                    (b.rating || 0) - (a.rating || 0)
                );
                
            case 'rating_asc':
                return sortedResults.sort((a, b) => 
                    (a.rating || 0) - (b.rating || 0)
                );
                
            case 'file_size':
                return sortedResults.sort((a, b) => 
                    (b.file_size || 0) - (a.file_size || 0)
                );
                
            case 'file_size_asc':
                return sortedResults.sort((a, b) => 
                    (a.file_size || 0) - (b.file_size || 0)
                );
                
            case 'dimensions':
                return sortedResults.sort((a, b) => {
                    const aTotal = (a.width || 0) * (a.height || 0);
                    const bTotal = (b.width || 0) * (b.height || 0);
                    return bTotal - aTotal;
                });
                
            case 'prompt_length':
                return sortedResults.sort((a, b) => {
                    const aLength = a.prompt ? a.prompt.length : 0;
                    const bLength = b.prompt ? b.prompt.length : 0;
                    return bLength - aLength;
                });
                
            default:
                return sortedResults;
        }
    },
    
    /**
     * Gets available sort options
     */
    getSortOptions() {
        return [
            { id: 'created_at', name: 'Newest First', icon: '🕒' },
            { id: 'created_at_asc', name: 'Oldest First', icon: '⏰' },
            { id: 'rating', name: 'Highest Rated', icon: '⭐' },
            { id: 'rating_asc', name: 'Lowest Rated', icon: '⭐' },
            { id: 'file_size', name: 'Largest Files', icon: '📁' },
            { id: 'file_size_asc', name: 'Smallest Files', icon: '📁' },
            { id: 'dimensions', name: 'Largest Images', icon: '📐' },
            { id: 'prompt_length', name: 'Longest Prompts', icon: '📝' }
        ];
    },
    
    /**
     * Gets available date filter options
     */
    getDateFilterOptions() {
        return [
            { id: 'all', name: 'All Time', icon: '🕰️' },
            { id: 'today', name: 'Today', icon: '📅' },
            { id: 'week', name: 'This Week', icon: '📆' },
            { id: 'month', name: 'This Month', icon: '🗓️' },
            { id: 'year', name: 'This Year', icon: '📊' }
        ];
    },
    
    /**
     * Gets available dimension filter options from results
     */
    getDimensionOptions(results) {
        if (!results || !Array.isArray(results)) return [];
        
        const dimensionsSet = new Set();
        
        results.forEach(result => {
            if (result.width && result.height) {
                dimensionsSet.add(`${result.width}x${result.height}`);
            }
        });
        
        const dimensions = Array.from(dimensionsSet).sort((a, b) => {
            const [aW, aH] = a.split('x').map(Number);
            const [bW, bH] = b.split('x').map(Number);
            return (bW * bH) - (aW * aH); // Sort by total pixels, largest first
        });
        
        return [
            { id: 'all', name: 'All Sizes' },
            ...dimensions.map(dim => ({ id: dim, name: dim }))
        ];
    },
    
    /**
     * Gets rating filter options
     */
    getRatingFilterOptions() {
        return [
            { id: 0, name: 'All Ratings', icon: '⭐' },
            { id: 1, name: '1+ Stars', icon: '⭐' },
            { id: 2, name: '2+ Stars', icon: '⭐⭐' },
            { id: 3, name: '3+ Stars', icon: '⭐⭐⭐' },
            { id: 4, name: '4+ Stars', icon: '⭐⭐⭐⭐' },
            { id: 5, name: '5 Stars', icon: '⭐⭐⭐⭐⭐' }
        ];
    },
    
    /**
     * Creates a search query object from filters
     */
    createSearchQuery(filters) {
        const query = {};
        
        if (filters.searchTerm && filters.searchTerm.trim()) {
            query.search = filters.searchTerm.trim();
        }
        
        if (filters.dateFilter && filters.dateFilter !== 'all') {
            query.date_filter = filters.dateFilter;
        }
        
        if (filters.ratingFilter && filters.ratingFilter > 0) {
            query.min_rating = filters.ratingFilter;
        }
        
        if (filters.dimensionFilter && filters.dimensionFilter !== 'all') {
            const [width, height] = filters.dimensionFilter.split('x').map(Number);
            query.width = width;
            query.height = height;
        }
        
        if (filters.sortBy) {
            query.sort_by = filters.sortBy;
        }
        
        return query;
    },
    
    /**
     * Parses search query back to filter object
     */
    parseSearchQuery(queryParams) {
        const filters = {};
        
        if (queryParams.search) {
            filters.searchTerm = queryParams.search;
        }
        
        if (queryParams.date_filter) {
            filters.dateFilter = queryParams.date_filter;
        }
        
        if (queryParams.min_rating) {
            filters.ratingFilter = parseInt(queryParams.min_rating, 10);
        }
        
        if (queryParams.width && queryParams.height) {
            filters.dimensionFilter = `${queryParams.width}x${queryParams.height}`;
        }
        
        if (queryParams.sort_by) {
            filters.sortBy = queryParams.sort_by;
        }
        
        return filters;
    },
    
    /**
     * Validates filter values
     */
    validateFilters(filters) {
        const errors = [];
        
        if (filters.ratingFilter && (filters.ratingFilter < 0 || filters.ratingFilter > 5)) {
            errors.push('Rating filter must be between 0 and 5');
        }
        
        if (filters.dimensionFilter && filters.dimensionFilter !== 'all') {
            const dimensionPattern = /^\d+x\d+$/;
            if (!dimensionPattern.test(filters.dimensionFilter)) {
                errors.push('Dimension filter must be in format WIDTHxHEIGHT');
            }
        }
        
        const validSortOptions = this.getSortOptions().map(opt => opt.id);
        if (filters.sortBy && !validSortOptions.includes(filters.sortBy)) {
            errors.push('Invalid sort option');
        }
        
        const validDateOptions = this.getDateFilterOptions().map(opt => opt.id);
        if (filters.dateFilter && !validDateOptions.includes(filters.dateFilter)) {
            errors.push('Invalid date filter option');
        }
        
        return errors;
    },
    
    /**
     * Gets filter summary for display
     */
    getFilterSummary(filters, resultCount) {
        const summary = [];
        
        if (filters.searchTerm && filters.searchTerm.trim()) {
            summary.push(`Search: "${filters.searchTerm}"`);
        }
        
        if (filters.dateFilter && filters.dateFilter !== 'all') {
            const dateOption = this.getDateFilterOptions().find(opt => opt.id === filters.dateFilter);
            if (dateOption) {
                summary.push(`Date: ${dateOption.name}`);
            }
        }
        
        if (filters.ratingFilter && filters.ratingFilter > 0) {
            summary.push(`Rating: ${filters.ratingFilter}+ stars`);
        }
        
        if (filters.dimensionFilter && filters.dimensionFilter !== 'all') {
            summary.push(`Size: ${filters.dimensionFilter}`);
        }
        
        const sortOption = this.getSortOptions().find(opt => opt.id === filters.sortBy);
        if (sortOption) {
            summary.push(`Sort: ${sortOption.name}`);
        }
        
        return {
            filters: summary,
            resultCount,
            hasActiveFilters: summary.length > 0
        };
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationHistoryFilters };
} else if (typeof window !== 'undefined') {
    window.generationHistoryFilters = generationHistoryFilters;
}
