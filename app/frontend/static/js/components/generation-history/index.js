/**
 * Generation History - Main Component Module
 * 
 * Main Alpine.js component that integrates all generation history modules
 * following the established modular architecture pattern.
 */

/**
 * Main Generation History Alpine.js component factory
 */
function generationHistory() {
    // Initialize state using state module
    const state = window.createGenerationHistoryState ? window.createGenerationHistoryState() : {};
    
    return {
        // Spread state properties
        ...state,
        
        // Component initialization
        async init() {
            await this.loadInitialData();
            this.loadPreferences();
            this.setupUIHandlers();
            this.startPeriodicRefresh();
            // Mark component as ready for template bindings
            this.isInitialized = true;
        },
        
        // Data Loading Methods
        async loadInitialData() {
            if (!window.generationHistoryData) {
                this.showToastMessage('Data module not available', 'error');
                return;
            }
            
            this.setLoading(true);
            
            try {
                const { results, hasMore } = await window.generationHistoryData.loadResults(1, 20);
                
                // Update state with loaded data
                if (window.generationHistoryState) {
                    window.generationHistoryState.setResults(this, results);
                    window.generationHistoryState.setPagination(this, { hasMore, currentPage: 1 });
                }
                
                // Apply initial filters
                this.applyFilters();
                
                // Calculate statistics
                this.calculateStats();
                
            } catch (error) {
                this.showToastMessage('Failed to load generation history', 'error');
            } finally {
                this.setLoading(false);
            }
        },
        
        async loadMoreResults() {
            if (!this.hasMore || this.isLoading) return;
            
            this.setLoading(true);
            
            try {
                const nextPage = this.currentPage + 1;
                const { results, hasMore } = await window.generationHistoryData.loadResults(nextPage, 20);
                
                if (window.generationHistoryState) {
                    window.generationHistoryState.addResults(this, results);
                    window.generationHistoryState.setPagination(this, { hasMore, currentPage: nextPage });
                }
                
                this.applyFilters();
                this.calculateStats();
                
            } catch (error) {
                this.showToastMessage('Failed to load more results', 'error');
            } finally {
                this.setLoading(false);
            }
        },
        
        async refreshData() {
            this.currentPage = 1;
            this.hasMore = true;
            await this.loadInitialData();
            this.showToastMessage('History refreshed');
        },
        
        // Filtering Methods
        applyFilters() {
            if (!window.generationHistoryFilters) return;
            
            const filters = {
                searchTerm: this.searchTerm,
                dateFilter: this.dateFilter,
                ratingFilter: this.ratingFilter,
                dimensionFilter: this.dimensionFilter,
                sortBy: this.sortBy
            };
            
            const filtered = window.generationHistoryFilters.applyFilters(this.results, filters);
            
            if (window.generationHistoryState) {
                window.generationHistoryState.setFilteredResults(this, filtered);
            }
        },
        
        updateSearch(searchTerm) {
            if (window.generationHistoryState) {
                window.generationHistoryState.setSearchTerm(this, searchTerm);
                this.applyFilters();
            }
        },
        
        updateSort(sortBy) {
            if (window.generationHistoryState) {
                window.generationHistoryState.setSortBy(this, sortBy);
                this.applyFilters();
            }
        },
        
        updateFilters(newFilters) {
            if (window.generationHistoryState) {
                window.generationHistoryState.setFilters(this, newFilters);
                this.applyFilters();
            }
        },
        
        resetFilters() {
            if (window.generationHistoryState) {
                window.generationHistoryState.resetFilters(this);
                this.applyFilters();
            }
        },
        
        // Item Operations
        async updateRating(result, rating) {
            if (!window.generationHistoryData) return;
            
            try {
                await window.generationHistoryData.updateRating(result.id, rating);
                
                if (window.generationHistoryState) {
                    window.generationHistoryState.updateResult(this, result.id, { rating });
                }
                
                this.calculateStats();
                this.showToastMessage('Rating updated');
                
            } catch (error) {
                this.showToastMessage('Failed to update rating', 'error');
            }
        },
        
        async toggleFavorite(result) {
            if (!window.generationHistoryData) return;
            
            try {
                const newFavoriteStatus = !result.is_favorite;
                await window.generationHistoryData.updateFavorite(result.id, newFavoriteStatus);
                
                if (window.generationHistoryState) {
                    window.generationHistoryState.updateResult(this, result.id, { 
                        is_favorite: newFavoriteStatus 
                    });
                }
                
                this.calculateStats();
                const message = newFavoriteStatus ? 'Added to favorites' : 'Removed from favorites';
                this.showToastMessage(message);
                
            } catch (error) {
                this.showToastMessage('Failed to update favorite status', 'error');
            }
        },
        
        async deleteSelected() {
            if (this.selectedItems.length === 0) return;
            
            if (!confirm(`Delete ${this.selectedItems.length} selected items?`)) return;
            
            try {
                await window.generationHistoryData.deleteResults(this.selectedItems);
                
                if (window.generationHistoryState) {
                    window.generationHistoryState.removeResults(this, this.selectedItems);
                    window.generationHistoryState.clearSelection(this);
                }
                
                this.applyFilters();
                this.calculateStats();
                this.showToastMessage(`${this.selectedItems.length} items deleted`);
                
            } catch (error) {
                this.showToastMessage('Failed to delete items', 'error');
            }
        },
        
        async favoriteSelected() {
            if (this.selectedItems.length === 0) return;
            
            try {
                await window.generationHistoryData.bulkUpdateFavorites(this.selectedItems, true);
                
                this.selectedItems.forEach(id => {
                    if (window.generationHistoryState) {
                        window.generationHistoryState.updateResult(this, id, { is_favorite: true });
                    }
                });
                
                this.calculateStats();
                this.showToastMessage(`${this.selectedItems.length} items added to favorites`);
                
            } catch (error) {
                this.showToastMessage('Failed to update favorites', 'error');
            }
        },
        
        async exportSelected() {
            if (this.selectedItems.length === 0) return;
            
            try {
                await window.generationHistoryData.exportResults(this.selectedItems);
                this.showToastMessage('Export started');
                
            } catch (error) {
                this.showToastMessage('Export failed', 'error');
            }
        },
        
        reuseParameters(result) {
            const parameters = {
                prompt: result.prompt,
                negative_prompt: result.negative_prompt || '',
                width: result.width,
                height: result.height,
                steps: result.steps,
                cfg_scale: result.cfg_scale,
                seed: result.seed,
                loras: result.loras || []
            };
            
            if (window.generationHistoryData) {
                window.generationHistoryData.saveParametersForReuse(parameters);
                this.showToastMessage('Parameters saved for reuse');
            }
        },
        
        // UI Methods
        setViewMode(mode) {
            if (window.generationHistoryState) {
                window.generationHistoryState.setViewMode(this, mode);
            }
        },
        
        openModal(result) {
            if (window.generationHistoryState) {
                window.generationHistoryState.setSelectedResult(this, result);
                window.generationHistoryState.setModalVisible(this, true);
            }
        },
        
        closeModal() {
            if (window.generationHistoryState) {
                window.generationHistoryState.setModalVisible(this, false);
                window.generationHistoryState.setSelectedResult(this, null);
            }
        },
        
        navigateModal(direction) {
            if (!this.selectedResult || !window.generationHistoryUI) return;
            
            const navigation = window.generationHistoryUI.getModalNavigation(
                this.selectedResult, 
                this.filteredResults
            );
            
            if (direction === 'next' && navigation.nextResult) {
                this.openModal(navigation.nextResult);
            } else if (direction === 'previous' && navigation.previousResult) {
                this.openModal(navigation.previousResult);
            }
        },
        
        // Selection Methods
        toggleItemSelection(itemId) {
            if (window.generationHistoryState) {
                window.generationHistoryState.toggleItemSelection(this, itemId);
            }
        },
        
        selectAll() {
            if (window.generationHistoryState) {
                window.generationHistoryState.selectAllFiltered(this);
            }
        },
        
        clearSelection() {
            if (window.generationHistoryState) {
                window.generationHistoryState.clearSelection(this);
            }
        },
        
        // Utility Methods
        calculateStats() {
            if (!window.generationHistoryData) return;
            
            const stats = window.generationHistoryData.calculateLocalStats(this.results);
            
            if (window.generationHistoryState) {
                window.generationHistoryState.setStats(this, stats);
            }
        },
        
        formatFileSize(bytes) {
            return window.generationHistoryData ? 
                window.generationHistoryData.formatFileSize(bytes) : 
                `${bytes} bytes`;
        },
        
        getFilterSummary() {
            return window.generationHistoryFilters ? 
                window.generationHistoryFilters.getFilterSummary({
                    searchTerm: this.searchTerm,
                    dateFilter: this.dateFilter,
                    ratingFilter: this.ratingFilter,
                    dimensionFilter: this.dimensionFilter,
                    sortBy: this.sortBy
                }, this.filteredResults.length) : 
                { filters: [], resultCount: this.filteredResults.length, hasActiveFilters: false };
        },
        
        getSortOptions() {
            return window.generationHistoryFilters ? 
                window.generationHistoryFilters.getSortOptions() : 
                [{ id: 'created_at', name: 'Newest First' }];
        },
        
        getDateFilterOptions() {
            return window.generationHistoryFilters ? 
                window.generationHistoryFilters.getDateFilterOptions() : 
                [{ id: 'all', name: 'All Time' }];
        },
        
        getDimensionOptions() {
            return window.generationHistoryFilters ? 
                window.generationHistoryFilters.getDimensionOptions(this.results) : 
                [{ id: 'all', name: 'All Sizes' }];
        },
        
        // Private Methods
        setLoading(isLoading) {
            if (window.generationHistoryState) {
                window.generationHistoryState.setLoading(this, isLoading);
            }
        },
        
        showToastMessage(message, type = 'success') {
            if (window.generationHistoryState) {
                window.generationHistoryState.showToast(this, { message, type });
                
                setTimeout(() => {
                    window.generationHistoryState.hideToast(this);
                }, 3000);
            }
        },
        
        loadPreferences() {
            if (window.generationHistoryState) {
                window.generationHistoryState.loadViewModePreference(this);
            }
        },
        
        setupUIHandlers() {
            if (!window.generationHistoryUI) return;
            
            // Setup keyboard handlers
            this.keyboardCleanup = window.generationHistoryUI.setupKeyboardListeners({
                getState: () => this,
                closeModal: () => this.closeModal(),
                clearSelection: () => this.clearSelection(),
                deleteSelected: () => this.deleteSelected(),
                selectAll: () => this.selectAll(),
                focusSearch: () => {
                    const searchInput = document.querySelector('input[type="search"]');
                    if (searchInput) searchInput.focus();
                },
                toggleViewMode: (mode) => this.setViewMode(mode),
                navigateModal: (direction) => this.navigateModal(direction)
            });
            
            // Setup infinite scroll
            this.scrollCleanup = window.generationHistoryUI.setupInfiniteScroll(() => {
                return this.loadMoreResults();
            });
            
            // Setup lazy loading
            this.lazyLoadCleanup = window.generationHistoryUI.setupLazyLoading();
        },
        
        startPeriodicRefresh() {
            // Refresh data every 5 minutes
            this.refreshInterval = setInterval(() => {
                if (!document.hidden) {
                    this.refreshData();
                }
            }, 5 * 60 * 1000);
        },
        
        // Cleanup
        destroy() {
            // Clean up event listeners
            if (this.keyboardCleanup) this.keyboardCleanup();
            if (this.scrollCleanup) this.scrollCleanup();
            if (this.lazyLoadCleanup) this.lazyLoadCleanup();
            
            // Clear intervals
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
        }
    };
}

export { generationHistory, generationHistory as createGenerationHistoryComponent };

// Register with Alpine.js or make globally available
if (typeof Alpine !== 'undefined') {
    Alpine.data('generationHistory', generationHistory);
} else if (typeof window !== 'undefined') {
    window.generationHistory = generationHistory;
}

// CommonJS export for Node/Jest and back-compat
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationHistory, createGenerationHistoryComponent: generationHistory };
}
