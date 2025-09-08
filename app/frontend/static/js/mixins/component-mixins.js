/**
 * Alpine.js Component Mixins
 * Reusable functionality that can be mixed into components
 */

// Base component mixin with common functionality
function createBaseComponent(customData = {}) {
    return {
    // Common state (components should declare isLoading locally)
    hasError: false,
        errorMessage: '',

        // Common initialization
        init() {
            if (this.customInit) {
                this.customInit();
            }
        },

        // Common error handling
        handleError(error, context = '') {
            this.hasError = true;
            this.errorMessage = error.message || 'An error occurred';
            this.isLoading = false;
            
            window.DevLogger?.error?.(`Error in ${context}:`, error);
            
            // Try to show notification if available
            try {
                const notifications = Alpine.store?.('notifications');
                if (notifications?.add) {
                    notifications.add(this.errorMessage, 'error');
                }
            } catch (e) {
                // Fallback to DevLogger if notifications not available
                window.DevLogger?.error?.(`${context}: ${this.errorMessage}`);
            }
        },

        // Common success notification
        showSuccess(message) {
            try {
                const notifications = Alpine.store?.('notifications');
                if (notifications?.add) {
                    notifications.add(message, 'success');
                }
            } catch (e) {
                window.DevLogger?.debug?.(`Success: ${message}`);
            }
        },

        // Common loading wrapper
        async withLoading(asyncFn, context = '') {
            this.isLoading = true;
            this.hasError = false;
            this.errorMessage = '';

            try {
                const result = await asyncFn();
                return result;
            } catch (error) {
                this.handleError(error, context);
                throw error;
            } finally {
                this.isLoading = false;
            }
        },

        // Merge custom data
        ...customData
    };
}

// Pagination mixin
function createPaginationMixin() {
    return {
        currentPage: 1,
        pageSize: 50,
        hasMore: true,
        totalCount: 0,

        resetPagination() {
            this.currentPage = 1;
            this.hasMore = true;
            this.totalCount = 0;
        },

        nextPage() {
            if (this.hasMore) {
                this.currentPage++;
            }
        },

        get totalPages() {
            return Math.ceil(this.totalCount / this.pageSize);
        },

        get isFirstPage() {
            return this.currentPage === 1;
        },

        get isLastPage() {
            return this.currentPage >= this.totalPages;
        }
    };
}

// Filtering mixin
function createFilterMixin(defaultFilters = {}) {
    return {
        filters: { ...defaultFilters },
        searchTerm: '',

        applyFilters(items) {
            let filtered = [...items];

            // Apply search term
            if (this.searchTerm.trim()) {
                const searchLower = this.searchTerm.toLowerCase();
                filtered = filtered.filter(item => 
                    this.searchableFields?.some(field => 
                        item[field]?.toLowerCase?.().includes(searchLower)
                    ) || 
                    JSON.stringify(item).toLowerCase().includes(searchLower)
                );
            }

            // Apply custom filters
            Object.entries(this.filters).forEach(([key, value]) => {
                if (value !== null && value !== undefined && value !== '' && value !== 'all') {
                    filtered = this.applyCustomFilter?.(filtered, key, value) || filtered;
                }
            });

            return filtered;
        },

        clearFilters() {
            this.searchTerm = '';
            this.filters = { ...defaultFilters };
            if (this.onFiltersCleared) {
                this.onFiltersCleared();
            }
        },

        updateFilter(key, value) {
            this.filters[key] = value;
            if (this.onFilterChanged) {
                this.onFilterChanged(key, value);
            }
        }
    };
}

// Selection mixin for bulk operations
function createSelectionMixin() {
    return {
        selectedItems: [],
        selectAll: false,

        toggleSelectAll(items) {
            if (this.selectAll) {
                this.selectedItems = items.map(item => item.id);
            } else {
                this.selectedItems = [];
            }
        },

        toggleSelection(itemId) {
            const index = this.selectedItems.indexOf(itemId);
            if (index > -1) {
                this.selectedItems.splice(index, 1);
            } else {
                this.selectedItems.push(itemId);
            }
            this.updateSelectAllState();
        },

        updateSelectAllState() {
            // This should be called after items change
            if (this.filteredItems) {
                const allSelected = this.filteredItems.length > 0 && 
                    this.filteredItems.every(item => this.selectedItems.includes(item.id));
                this.selectAll = allSelected;
            }
        },

        clearSelection() {
            this.selectedItems = [];
            this.selectAll = false;
        },

        get hasSelection() {
            return this.selectedItems.length > 0;
        },

        get selectionCount() {
            return this.selectedItems.length;
        }
    };
}

// Modal mixin
function createModalMixin() {
    return {
        showModal: false,
        modalData: null,

        openModal(data = null) {
            this.modalData = data;
            this.showModal = true;
            document.body.style.overflow = 'hidden';
        },

        closeModal() {
            this.showModal = false;
            this.modalData = null;
            document.body.style.overflow = '';
        },

        // Handle escape key
        handleModalKeydown(event) {
            if (event.key === 'Escape' && this.showModal) {
                this.closeModal();
            }
        }
    };
}

// Toast notification mixin
function createToastMixin() {
    return {
        showToast: false,
        toastMessage: '',
        toastType: 'success',

        showToastMessage(message, type = 'success', duration = 3000) {
            this.toastMessage = message;
            this.toastType = type;
            this.showToast = true;
            
            setTimeout(() => {
                this.showToast = false;
            }, duration);
        }
    };
}

// Export mixins
window.AlpineMixins = {
    createBaseComponent,
    createPaginationMixin,
    createFilterMixin,
    createSelectionMixin,
    createModalMixin,
    createToastMixin
};
