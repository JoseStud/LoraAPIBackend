/**
 * Generation History Component
 * Refactored into smaller, focused functionality using mixins
 */

function createGenerationHistoryComponent() {
    // Combine multiple mixins with custom component logic
    const baseComponent = window.AlpineMixins.createBaseComponent();
    const paginationMixin = window.AlpineMixins.createPaginationMixin();
    const filterMixin = window.AlpineMixins.createFilterMixin({
        sortBy: 'created_at',
        dateFilter: 'all',
        ratingFilter: 0,
        dimensionFilter: 'all'
    });
    const selectionMixin = window.AlpineMixins.createSelectionMixin();
    const modalMixin = window.AlpineMixins.createModalMixin();
    const toastMixin = window.AlpineMixins.createToastMixin();

    return {
        // Merge all mixins
        ...baseComponent,
        ...paginationMixin,
        ...filterMixin,
        ...selectionMixin,
        ...modalMixin,
        ...toastMixin,

    // Explicit local loading flag (avoid relying solely on mixin-provided value)
    isLoading: false,

        // Component-specific state
        results: [],
        filteredResults: [],
        viewMode: 'grid',
        
        // Statistics
        stats: {
            total_results: 0,
            avg_rating: 0,
            total_favorites: 0,
            total_size: 0
        },

        // Configuration
        searchableFields: ['prompt', 'negative_prompt'],

        async customInit() {
            await this.loadResults();
            this.calculateStats();
            
            const savedViewMode = localStorage.getItem('history-view-mode');
            if (savedViewMode) {
                this.viewMode = savedViewMode;
            }
        },

        async loadResults() {
            await this.withLoading(async () => {
                const params = {
                    page: this.currentPage,
                    page_size: this.pageSize
                };
                
                const data = await window.APIService.getResults(params);
                
                if (this.currentPage === 1) {
                    this.results = data.results || [];
                } else {
                    this.results.push(...(data.results || []));
                }
                
                this.hasMore = data.has_more || false;
                this.totalCount = data.total || this.results.length;
                
                this.applyFiltersAndSort();
            }, 'loadResults');
        },

        async loadMore() {
            if (!this.hasMore || this.isLoading) return;
            
            this.nextPage();
            await this.loadResults();
        },

        applyFiltersAndSort() {
            // Apply filters using mixin
            this.filteredResults = this.applyFilters(this.results);
            
            // Apply sorting
            this.sortResults(this.filteredResults);
            
            // Update selection state
            this.updateSelectAllState();
            
            // Recalculate stats
            this.calculateStats();
        },

        applyCustomFilter(items, key, value) {
            switch (key) {
                case 'dateFilter':
                    return this.filterByDate(items, value);
                case 'ratingFilter':
                    return items.filter(item => (item.rating || 0) >= value);
                case 'dimensionFilter': {
                    const [width, height] = value.split('x').map(Number);
                    return items.filter(item => item.width === width && item.height === height);
                }
                default:
                    return items;
            }
        },

        filterByDate(items, dateFilter) {
            if (dateFilter === 'all') return items;
            
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
                default:
                    return items;
            }
            
            return items.filter(item => new Date(item.created_at) >= filterDate);
        },

        sortResults(results) {
            switch (this.filters.sortBy) {
                case 'created_at':
                    results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                    break;
                case 'created_at_asc':
                    results.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                    break;
                case 'prompt':
                    results.sort((a, b) => a.prompt.localeCompare(b.prompt));
                    break;
                case 'rating':
                    results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                    break;
            }
        },

        calculateStats() {
            this.stats.total_results = this.filteredResults.length;
            
            if (this.filteredResults.length > 0) {
                const totalRating = this.filteredResults.reduce((sum, result) => sum + (result.rating || 0), 0);
                this.stats.avg_rating = totalRating / this.filteredResults.length;
                this.stats.total_favorites = this.filteredResults.filter(result => result.is_favorite).length;
                this.stats.total_size = this.filteredResults.length * 2.5 * 1024 * 1024; // Estimate
            } else {
                this.stats.avg_rating = 0;
                this.stats.total_favorites = 0;
                this.stats.total_size = 0;
            }
        },

        onFiltersCleared() {
            this.applyFiltersAndSort();
        },

        onFilterChanged() {
            this.applyFiltersAndSort();
        },

        setViewMode(mode) {
            this.viewMode = mode;
            localStorage.setItem('history-view-mode', mode);
        },

        showImageModal(result) {
            this.openModal(result);
        },

        // Action methods using API service
        async setRating(result, rating) {
            try {
                await window.APIService.updateResultRating(result.id, rating);
                result.rating = rating;
                this.calculateStats();
                this.showToastMessage('Rating updated successfully');
            } catch (error) {
                this.handleError(error, 'setRating');
            }
        },

        async toggleFavorite(result) {
            try {
                const newFavoriteState = !result.is_favorite;
                await window.APIService.toggleResultFavorite(result.id, newFavoriteState);
                
                result.is_favorite = newFavoriteState;
                this.calculateStats();
                
                const message = newFavoriteState ? 'Added to favorites' : 'Removed from favorites';
                this.showToastMessage(message);
            } catch (error) {
                this.handleError(error, 'toggleFavorite');
            }
        },

        async deleteResult(resultId) {
            if (!confirm('Are you sure you want to delete this image?')) return;
            
            try {
                await window.APIService.deleteResult(resultId);
                this.results = this.results.filter(r => r.id !== resultId);
                this.applyFiltersAndSort();
                this.showToastMessage('Image deleted successfully');
            } catch (error) {
                this.handleError(error, 'deleteResult');
            }
        },

        async deleteSelected() {
            if (this.selectionCount === 0) return;
            
            if (!confirm(`Are you sure you want to delete ${this.selectionCount} selected images?`)) return;
            
            try {
                await window.APIService.bulkDeleteResults(this.selectedItems);
                this.results = this.results.filter(r => !this.selectedItems.includes(r.id));
                this.clearSelection();
                this.applyFiltersAndSort();
                this.showToastMessage(`${this.selectionCount} images deleted successfully`);
            } catch (error) {
                this.handleError(error, 'deleteSelected');
            }
        },

        async favoriteSelected() {
            if (this.selectionCount === 0) return;
            
            try {
                await window.APIService.bulkFavoriteResults(this.selectedItems, true);
                
                this.results.forEach(result => {
                    if (this.selectedItems.includes(result.id)) {
                        result.is_favorite = true;
                    }
                });
                
                this.calculateStats();
                this.showToastMessage(`${this.selectionCount} images added to favorites`);
            } catch (error) {
                this.handleError(error, 'favoriteSelected');
            }
        },

        async exportSelected() {
            if (this.selectionCount === 0) return;
            
            try {
                const response = await window.APIService.exportResults(this.selectedItems);
                
                // Handle blob response for download
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `generation-export-${Date.now()}.zip`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showToastMessage('Export started');
            } catch (error) {
                this.handleError(error, 'exportSelected');
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
            
            localStorage.setItem('reuse-parameters', JSON.stringify(parameters));
            window.location.href = '/compose';
        },

        async downloadImage(result) {
            try {
                const response = await fetch(result.image_url);
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `generation-${result.id}.png`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                this.showToastMessage('Download started');
            } catch (error) {
                this.handleError(error, 'downloadImage');
            }
        },

        // Utility methods
        formatDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) return 'Today';
            else if (diffDays === 2) return 'Yesterday';
            else if (diffDays <= 7) return `${diffDays - 1} days ago`;
            else return date.toLocaleDateString();
        },

        formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },

        // Keyboard shortcuts
        handleKeydown(event) {
            if (event.key === 'Escape') {
                if (this.showModal) {
                    this.closeModal();
                } else if (this.hasSelection) {
                    this.clearSelection();
                }
            } else if (event.key === 'Delete' && this.hasSelection) {
                this.deleteSelected();
            } else if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                this.selectedItems = this.filteredResults.map(r => r.id);
                this.updateSelectAllState();
            }
        }
    };
}

// Export the component factory and register once with ComponentLoader
window.createGenerationHistoryComponent = createGenerationHistoryComponent;
if (window.ComponentLoader) {
    window.ComponentLoader.registerComponent('generationHistory', createGenerationHistoryComponent);
} else {
    window.generationHistory = createGenerationHistoryComponent;
    document.addEventListener('DOMContentLoaded', () => {
        if (window.ComponentLoader) {
            window.ComponentLoader.registerComponent('generationHistory', createGenerationHistoryComponent);
        }
    });
}
