/**
 * Generation History - State Management Module
 * 
 * Handles all state-related functionality for generation history
 * including results data, filters, UI state, and statistics.
 */

/**
 * Creates the initial state for generation history component
 */
function createGenerationHistoryState() {
    return {
        // Core Data
        results: [],
        filteredResults: [],
        selectedItems: [],
        selectedResult: null,
        
        // UI State
        viewMode: 'grid', // 'grid' or 'list'
        showModal: false,
        showToast: false,
        toastMessage: '',
        toastType: 'success',
        isLoading: false,
        hasMore: true,
        currentPage: 1,
        
        // Filters
        searchTerm: '',
        sortBy: 'created_at',
        dateFilter: 'all',
        ratingFilter: 0,
        dimensionFilter: 'all',
        
        // Statistics
        stats: {
            total_results: 0,
            avg_rating: 0,
            total_favorites: 0,
            total_size: 0
        }
    };
}

/**
 * State mutation methods for generation history
 */
const generationHistoryState = {
    /**
     * Sets the results data
     */
    setResults(state, results) {
        state.results = [...results];
        return state;
    },
    
    /**
     * Adds results to existing data (for pagination)
     */
    addResults(state, results) {
        state.results = [...state.results, ...results];
        return state;
    },
    
    /**
     * Sets filtered results
     */
    setFilteredResults(state, filteredResults) {
        state.filteredResults = [...filteredResults];
        return state;
    },
    
    /**
     * Updates a single result
     */
    updateResult(state, resultId, updates) {
        const resultIndex = state.results.findIndex(r => r.id === resultId);
        if (resultIndex !== -1) {
            Object.assign(state.results[resultIndex], updates);
        }
        
        const filteredIndex = state.filteredResults.findIndex(r => r.id === resultId);
        if (filteredIndex !== -1) {
            Object.assign(state.filteredResults[filteredIndex], updates);
        }
        
        return state;
    },
    
    /**
     * Removes results by IDs
     */
    removeResults(state, ids) {
        state.results = state.results.filter(r => !ids.includes(r.id));
        state.filteredResults = state.filteredResults.filter(r => !ids.includes(r.id));
        return state;
    },
    
    /**
     * Sets loading state
     */
    setLoading(state, isLoading) {
        state.isLoading = isLoading;
        return state;
    },
    
    /**
     * Sets pagination state
     */
    setPagination(state, { hasMore, currentPage }) {
        if (hasMore !== undefined) state.hasMore = hasMore;
        if (currentPage !== undefined) state.currentPage = currentPage;
        return state;
    },
    
    /**
     * Updates view mode
     */
    setViewMode(state, viewMode) {
        state.viewMode = viewMode;
        localStorage.setItem('history-view-mode', viewMode);
        return state;
    },
    
    /**
     * Sets selected result for modal
     */
    setSelectedResult(state, result) {
        state.selectedResult = result;
        return state;
    },
    
    /**
     * Shows/hides modal
     */
    setModalVisible(state, visible) {
        state.showModal = visible;
        return state;
    },
    
    /**
     * Updates search term
     */
    setSearchTerm(state, searchTerm) {
        state.searchTerm = searchTerm;
        return state;
    },
    
    /**
     * Updates filters
     */
    setFilters(state, filters) {
        Object.keys(filters).forEach(key => {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                state[key] = filters[key];
            }
        });
        return state;
    },
    
    /**
     * Sets sort criteria
     */
    setSortBy(state, sortBy) {
        state.sortBy = sortBy;
        return state;
    },
    
    /**
     * Updates selection
     */
    setSelectedItems(state, selectedItems) {
        state.selectedItems = [...selectedItems];
        return state;
    },
    
    /**
     * Toggles item selection
     */
    toggleItemSelection(state, itemId) {
        const index = state.selectedItems.indexOf(itemId);
        if (index === -1) {
            state.selectedItems.push(itemId);
        } else {
            state.selectedItems.splice(index, 1);
        }
        return state;
    },
    
    /**
     * Clears selection
     */
    clearSelection(state) {
        state.selectedItems = [];
        return state;
    },
    
    /**
     * Selects all filtered items
     */
    selectAllFiltered(state) {
        state.selectedItems = state.filteredResults.map(r => r.id);
        return state;
    },
    
    /**
     * Updates statistics
     */
    setStats(state, stats) {
        Object.assign(state.stats, stats);
        return state;
    },
    
    /**
     * Shows toast notification
     */
    showToast(state, { message, type = 'success' }) {
        state.toastMessage = message;
        state.toastType = type;
        state.showToast = true;
        return state;
    },
    
    /**
     * Hides toast notification
     */
    hideToast(state) {
        state.showToast = false;
        return state;
    },
    
    /**
     * Loads view mode from localStorage
     */
    loadViewModePreference(state) {
        const savedViewMode = localStorage.getItem('history-view-mode');
        if (savedViewMode && ['grid', 'list'].includes(savedViewMode)) {
            state.viewMode = savedViewMode;
        }
        return state;
    },
    
    /**
     * Resets filters to default
     */
    resetFilters(state) {
        state.searchTerm = '';
        state.sortBy = 'created_at';
        state.dateFilter = 'all';
        state.ratingFilter = 0;
        state.dimensionFilter = 'all';
        return state;
    },
    
    /**
     * Updates multiple state properties at once
     */
    updateMultiple(state, updates) {
        Object.keys(updates).forEach(key => {
            if (Object.prototype.hasOwnProperty.call(state, key)) {
                if (typeof state[key] === 'object' && !Array.isArray(state[key]) && state[key] !== null) {
                    Object.assign(state[key], updates[key]);
                } else {
                    state[key] = updates[key];
                }
            }
        });
        return state;
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createGenerationHistoryState, generationHistoryState };
} else if (typeof window !== 'undefined') {
    window.createGenerationHistoryState = createGenerationHistoryState;
    window.generationHistoryState = generationHistoryState;
}
