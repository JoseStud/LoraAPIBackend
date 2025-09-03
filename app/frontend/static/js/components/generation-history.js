/**
 * Generation History Alpine.js Component
 * Manages viewing, filtering, and organizing generation history
 */

function generationHistory() {
    return {
        // State
        results: [],
        filteredResults: [],
        selectedItems: [],
        selectedResult: null,
        
        // View state
        viewMode: 'grid', // 'grid' or 'list'
        showModal: false,
        showToast: false,
        toastMessage: '',
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
        },
        
        /**
         * Initialize the component
         */
        async init() {
            await this.loadResults();
            this.calculateStats();
            
            // Load view mode preference
            const savedViewMode = localStorage.getItem('history-view-mode');
            if (savedViewMode) {
                this.viewMode = savedViewMode;
            }
        },
        
        /**
         * Load generation results from the API
         */
        async loadResults() {
            try {
                this.isLoading = true;
                
                const params = new URLSearchParams({
                    page: this.currentPage,
                    page_size: 50
                });
                
                const response = await fetch(`/api/v1/results?${params}`);
                if (!response.ok) {
                    throw new Error('Failed to load results');
                }
                
                const data = await response.json();
                
                if (this.currentPage === 1) {
                    this.results = data.results;
                } else {
                    this.results.push(...data.results);
                }
                
                this.hasMore = data.has_more;
                this.applyFilters();
                
            } catch (error) {
                console.error('Error loading results:', error);
                this.showToastMessage('Failed to load results', 'error');
            } finally {
                this.isLoading = false;
            }
        },
        
        /**
         * Load more results (pagination)
         */
        async loadMore() {
            if (!this.hasMore || this.isLoading) return;
            
            this.currentPage++;
            await this.loadResults();
        },
        
        /**
         * Apply current filters to results
         */
        applyFilters() {
            let filtered = [...this.results];
            
            // Search filter
            if (this.searchTerm.trim()) {
                const searchLower = this.searchTerm.toLowerCase();
                filtered = filtered.filter(result => 
                    result.prompt.toLowerCase().includes(searchLower) ||
                    (result.negative_prompt && result.negative_prompt.toLowerCase().includes(searchLower))
                );
            }
            
            // Date filter
            if (this.dateFilter !== 'all') {
                const now = new Date();
                const filterDate = new Date();
                
                switch (this.dateFilter) {
                    case 'today':
                        filterDate.setHours(0, 0, 0, 0);
                        break;
                    case 'week':
                        filterDate.setDate(now.getDate() - 7);
                        break;
                    case 'month':
                        filterDate.setMonth(now.getMonth() - 1);
                        break;
                }
                
                filtered = filtered.filter(result => 
                    new Date(result.created_at) >= filterDate
                );
            }
            
            // Rating filter
            if (this.ratingFilter > 0) {
                filtered = filtered.filter(result => 
                    (result.rating || 0) >= this.ratingFilter
                );
            }
            
            // Dimension filter
            if (this.dimensionFilter !== 'all') {
                const [width, height] = this.dimensionFilter.split('x').map(Number);
                filtered = filtered.filter(result => 
                    result.width === width && result.height === height
                );
            }
            
            // Sort results
            this.sortResults(filtered);
            
            this.filteredResults = filtered;
            this.calculateStats();
        },
        
        /**
         * Sort results based on current sort option
         */
        sortResults(results) {
            switch (this.sortBy) {
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
        
        /**
         * Calculate statistics for current filtered results
         */
        calculateStats() {
            this.stats.total_results = this.filteredResults.length;
            
            if (this.filteredResults.length > 0) {
                // Average rating
                const totalRating = this.filteredResults.reduce((sum, result) => sum + (result.rating || 0), 0);
                this.stats.avg_rating = totalRating / this.filteredResults.length;
                
                // Total favorites
                this.stats.total_favorites = this.filteredResults.filter(result => result.is_favorite).length;
                
                // Total size (mock calculation - would need actual file sizes)
                this.stats.total_size = this.filteredResults.length * 2.5 * 1024 * 1024; // Assume 2.5MB per image
            } else {
                this.stats.avg_rating = 0;
                this.stats.total_favorites = 0;
                this.stats.total_size = 0;
            }
        },
        
        /**
         * Clear all filters
         */
        clearFilters() {
            this.searchTerm = '';
            this.sortBy = 'created_at';
            this.dateFilter = 'all';
            this.ratingFilter = 0;
            this.dimensionFilter = 'all';
            this.applyFilters();
        },
        
        /**
         * Toggle view mode between grid and list
         */
        setViewMode(mode) {
            this.viewMode = mode;
            localStorage.setItem('history-view-mode', mode);
        },
        
        /**
         * Show image in full-size modal
         */
        showImageModal(result) {
            this.selectedResult = result;
            this.showModal = true;
        },
        
        /**
         * Set rating for a result
         */
        async setRating(result, rating) {
            try {
                const response = await fetch(`/api/v1/results/${result.id}/rating`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ rating })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to update rating');
                }
                
                // Update local data
                result.rating = rating;
                this.calculateStats();
                
                this.showToastMessage('Rating updated successfully');
                
            } catch (error) {
                console.error('Error updating rating:', error);
                this.showToastMessage('Failed to update rating', 'error');
            }
        },
        
        /**
         * Toggle favorite status for a result
         */
        async toggleFavorite(result) {
            try {
                const response = await fetch(`/api/v1/results/${result.id}/favorite`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ is_favorite: !result.is_favorite })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to update favorite status');
                }
                
                // Update local data
                result.is_favorite = !result.is_favorite;
                this.calculateStats();
                
                const message = result.is_favorite ? 'Added to favorites' : 'Removed from favorites';
                this.showToastMessage(message);
                
            } catch (error) {
                console.error('Error updating favorite:', error);
                this.showToastMessage('Failed to update favorite status', 'error');
            }
        },
        
        /**
         * Reuse generation parameters
         */
        reuseParameters(result) {
            // Store parameters in localStorage for the compose page
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
            
            // Navigate to compose page
            window.location.href = '/compose';
        },
        
        /**
         * Download image
         */
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
                console.error('Error downloading image:', error);
                this.showToastMessage('Failed to download image', 'error');
            }
        },
        
        /**
         * Delete a single result
         */
        async deleteResult(resultId) {
            if (!confirm('Are you sure you want to delete this image?')) {
                return;
            }
            
            try {
                const response = await fetch(`/api/v1/results/${resultId}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    throw new Error('Failed to delete result');
                }
                
                // Remove from local data
                this.results = this.results.filter(r => r.id !== resultId);
                this.applyFilters();
                
                this.showToastMessage('Image deleted successfully');
                
            } catch (error) {
                console.error('Error deleting result:', error);
                this.showToastMessage('Failed to delete image', 'error');
            }
        },
        
        /**
         * Delete selected results
         */
        async deleteSelected() {
            if (this.selectedItems.length === 0) return;
            
            const count = this.selectedItems.length;
            if (!confirm(`Are you sure you want to delete ${count} selected images?`)) {
                return;
            }
            
            try {
                const response = await fetch('/api/v1/results/bulk-delete', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ids: this.selectedItems })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to delete results');
                }
                
                // Remove from local data
                this.results = this.results.filter(r => !this.selectedItems.includes(r.id));
                this.selectedItems = [];
                this.applyFilters();
                
                this.showToastMessage(`${count} images deleted successfully`);
                
            } catch (error) {
                console.error('Error deleting results:', error);
                this.showToastMessage('Failed to delete images', 'error');
            }
        },
        
        /**
         * Add selected items to favorites
         */
        async favoriteSelected() {
            if (this.selectedItems.length === 0) return;
            
            try {
                const response = await fetch('/api/v1/results/bulk-favorite', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ 
                        ids: this.selectedItems,
                        is_favorite: true 
                    })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to update favorites');
                }
                
                // Update local data
                this.results.forEach(result => {
                    if (this.selectedItems.includes(result.id)) {
                        result.is_favorite = true;
                    }
                });
                
                this.calculateStats();
                this.showToastMessage(`${this.selectedItems.length} images added to favorites`);
                
            } catch (error) {
                console.error('Error updating favorites:', error);
                this.showToastMessage('Failed to update favorites', 'error');
            }
        },
        
        /**
         * Export selected items
         */
        async exportSelected() {
            if (this.selectedItems.length === 0) return;
            
            try {
                const response = await fetch('/api/v1/results/export', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ids: this.selectedItems })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to export results');
                }
                
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
                console.error('Error exporting results:', error);
                this.showToastMessage('Failed to export images', 'error');
            }
        },
        
        /**
         * Clear current selection
         */
        clearSelection() {
            this.selectedItems = [];
        },
        
        /**
         * Format date for display
         */
        formatDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                return 'Today';
            } else if (diffDays === 2) {
                return 'Yesterday';
            } else if (diffDays <= 7) {
                return `${diffDays - 1} days ago`;
            } else {
                return date.toLocaleDateString();
            }
        },
        
        /**
         * Format file size for display
         */
        formatFileSize(bytes) {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        },
        
        /**
         * Show toast notification
         */
        showToastMessage(message, type = 'success') {
            this.toastMessage = message;
            this.showToast = true;
            
            setTimeout(() => {
                this.showToast = false;
            }, 3000);
        },
        
        /**
         * Handle keyboard shortcuts
         */
        handleKeydown(event) {
            if (event.key === 'Escape') {
                if (this.showModal) {
                    this.showModal = false;
                } else if (this.selectedItems.length > 0) {
                    this.clearSelection();
                }
            } else if (event.key === 'Delete' && this.selectedItems.length > 0) {
                this.deleteSelected();
            } else if (event.key === 'a' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                this.selectedItems = this.filteredResults.map(r => r.id);
            }
        }
    };
}

// Add keyboard event listener
document.addEventListener('keydown', function(event) {
    const historyComponent = Alpine.$data(document.querySelector('[x-data="generationHistory()"]'));
    if (historyComponent && typeof historyComponent.handleKeydown === 'function') {
        historyComponent.handleKeydown(event);
    }
});
