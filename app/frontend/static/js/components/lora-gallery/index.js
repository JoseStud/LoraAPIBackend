/**
 * LoRA Gallery Component Module
 * Complete implementation with bulk operations and filtering
 * Refactored to use the generic API data fetcher and modern ES modules
 */

import apiDataFetcher from '../shared/api-data-fetcher.js';
import { fetchData, postData } from '../../utils/api.js';
import { formatFileSize, formatRelativeTime } from '../../utils/formatters.js';
import { copyToClipboard } from '../../utils/browser.js';
import { showElement, hideElement } from '../../utils/dom.js';

/**
 * Individual LoRA Card Component
 * Self-contained component for each LoRA card
 */
function loraCard(initialData) {
    return {
        // Spread the initial data from the server
        ...initialData,

        // Ensure these properties always have a default value
        isSelected: false,
        active: initialData.active || false,
        weight: initialData.weight || 1.0,
        isExpanded: false,
        isLoading: false,

        // Card interaction methods
        toggleSelection() {
            this.isSelected = !this.isSelected;
            
            // Emit selection events for the gallery to listen to
            if (this.isSelected) {
                document.dispatchEvent(new CustomEvent('lora-selected', {
                    detail: { id: this.id, loraId: this.id }
                }));
            } else {
                document.dispatchEvent(new CustomEvent('lora-deselected', {
                    detail: { id: this.id, loraId: this.id }
                }));
            }
        },

        async toggleActive() {
            const previousState = this.active;
            this.active = !this.active;
            
            try {
                // Make API call to update the active state using new utility
                const response = await postData((window?.BACKEND_URL || '') + `/adapters/${this.id}/activate`, { 
                    active: this.active 
                });
                
                // Update with server response
                this.active = response.active;
                
                // Trigger a refresh of the gallery
                document.body.dispatchEvent(new CustomEvent('lora-data-updated'));
            } catch (error) {
                // Revert on error
                this.active = previousState;
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error('Failed to update LoRA status:', error);
                }
            }
        },

        toggleExpanded() {
            this.isExpanded = !this.isExpanded;
        },

        async loadDetails() {
            if (this.isLoading) return;
            this.isLoading = true;
            
            try {
                // Load additional details for the LoRA card using new utility
                const details = await fetchData((window?.BACKEND_URL || '') + `/adapters/${this.id}`);
                // Update the card with additional details
                Object.assign(this, details);
            } catch (error) {
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error('Error loading LoRA details:', error);
                }
            } finally {
                this.isLoading = false;
            }
        }
    };
}

/**
 * Initialize LoRA cards in a container
 * This function will be called after HTMX swaps new content
 */
function initLoraCards(container) {
    const cards = container.querySelectorAll('[x-data]');
    cards.forEach(card => {
        // Only initialize if not already initialized
        if (!card._x_dataStack) {
            Alpine.initTree(card);
        }
    });
}

// Make these functions available globally
window.loraCard = loraCard;
window.initLoraCards = initLoraCards;

export function createLoraGalleryComponent() {
    return {
        // Use the API data fetcher for loading LoRAs
    // Use the backend adapters endpoint directly to harmonize API paths
    ...apiDataFetcher((window?.BACKEND_URL || '') + '/adapters', {
            paginated: true,
            pageSize: 24,
            autoFetch: false,
            cacheKey: 'lora_gallery_cache',
            cacheDuration: 300000, // 5 minutes
            // successHandler will be called with the component bound as `this`
            successHandler: function (_data, _response) {
                try {
                    this.totalLoras = this.dataCount;
                    if (typeof this.calculateStats === 'function') this.calculateStats();
                } catch (e) {
                    window.DevLogger?.error?.('Error in successHandler for lora gallery:', e);
                }
            },
            // Error handler receives (error, ctx) from the data fetcher; use ctx
            errorHandler: (error, ctx) => {
                // Use the passed component context when available
                const target = ctx || this;
                try {
                    if (target && typeof target.showNotification === 'function') {
                        target.showNotification('Failed to load LoRAs', 'error');
                    } else if (typeof window !== 'undefined' && window.DevLogger) {
                        window.DevLogger.error('Failed to load LoRAs', error);
                    }
                } catch (e) {
                    window.DevLogger?.error?.('Error while handling fetch error for lora gallery:', e);
                }
                return true;
            }
        }),

        // Initialization state (required for x-show guards)
        isInitialized: false,
        
        // View and display options
        viewMode: 'grid',
        searchTerm: '',
        filters: {
            activeOnly: false,
            tags: []
        },
        sortBy: 'name_asc',
        availableTags: [],
        showAllTags: false,
        
        // Bulk operations
        bulkMode: false,
        selectedLoras: [],
        allSelected: false,
        totalLoras: 0,
        
        // Computed property for filtered LoRAs
        get filteredLoras() {
            let filtered = this.data || [];
            
            // Filter by search term
            if (this.searchTerm) {
                const searchLower = this.searchTerm.toLowerCase();
                filtered = filtered.filter(lora => 
                    lora.name?.toLowerCase().includes(searchLower) ||
                    lora.description?.toLowerCase().includes(searchLower) ||
                    lora.tags?.some(tag => tag.toLowerCase().includes(searchLower))
                );
            }
            
            // Filter by active only
            if (this.filters.activeOnly) {
                filtered = filtered.filter(lora => lora.is_active === true);
            }
            
            // Filter by tags
            if (this.filters.tags.length > 0) {
                filtered = filtered.filter(lora => 
                    this.filters.tags.some(tag => 
                        lora.tags?.includes(tag)
                    )
                );
            }
            
            return filtered;
        },
        
        init() {
            // Restore persisted view mode if present
            const savedViewMode = localStorage.getItem('loraViewMode');
            if (savedViewMode) this.viewMode = savedViewMode;
            this.$watch('viewMode', (value) => localStorage.setItem('loraViewMode', value));

            // Note: With the new $dispatch pattern, selection events will be handled
            // through @selection-changed attributes in the template rather than
            // global event listeners. This makes the data flow more explicit.

            // Legacy listeners for backward compatibility with any remaining global events
            document.addEventListener('lora-selected', (e) => {
                const id = e.detail && (e.detail.id || e.detail.loraId);
                if (!id) return;
                if (!this.selectedLoras.includes(id)) this.selectedLoras.push(id);
            });

            document.addEventListener('lora-deselected', (e) => {
                const id = e.detail && (e.detail.id || e.detail.loraId);
                if (!id) return;
                this.selectedLoras = this.selectedLoras.filter(i => i !== id);
            });

            document.addEventListener('lora-selection-changed', (e) => {
                const { loraId, selected } = e.detail || {};
                if (!loraId) return;
                if (selected) {
                    if (!this.selectedLoras.includes(loraId)) this.selectedLoras.push(loraId);
                } else {
                    this.selectedLoras = this.selectedLoras.filter(id => id !== loraId);
                }
            });

            // Listen for the htmx:afterSwap event on the container
            const container = this.$el.querySelector('#lora-container');
            if (container) {
                container.addEventListener('htmx:afterSwap', (event) => {
                    this.initCards(event.detail.elt);
                });
            }

            
            // Expose global methods for fallback scenarios
            this.exposeGlobalMethods();
            
            this.isInitialized = true;
            
            // Load LoRA data using the API data fetcher
            this.loadLoraData();
        },

        /**
         * Handle selection changes from lora-card components
         * This method is called via @selection-changed in the template
         */
        handleSelectionChange(detail) {
            const { id, selected } = detail;
            if (selected) {
                if (!this.selectedLoras.includes(id)) {
                    this.selectedLoras.push(id);
                }
            } else {
                this.selectedLoras = this.selectedLoras.filter(i => i !== id);
            }
        },

        /**
         * Handle lora updates from lora-card components
         * This method is called via @lora-updated in the template
         */
        handleLoraUpdate(detail) {
            const { id, type, active, weight } = detail;
            
            // Find and update the lora in our data
            const loraIndex = this.data.findIndex(lora => lora.id === id);
            if (loraIndex !== -1) {
                if (type === 'activation' && typeof active !== 'undefined') {
                    this.data[loraIndex].active = active;
                }
                if (type === 'weight' && typeof weight !== 'undefined') {
                    this.data[loraIndex].weight = weight;
                }
            }
            
            // Show notification based on update type
            if (type === 'activation') {
                this.showNotification(
                    `LoRA ${active ? 'activated' : 'deactivated'} successfully`,
                    'success'
                );
            } else if (type === 'weight') {
                this.showNotification(
                    `Weight updated to ${weight}`,
                    'info'
                );
            } else if (type === 'preview-generated') {
                this.showNotification(
                    'Preview generation started',
                    'info'
                );
            }
        },

        /**
         * Handle lora deletion from lora-card components
         * This method is called via @lora-deleted in the template
         */
        handleLoraDelete(detail) {
            const { id, name } = detail;
            
            // Remove from our data
            this.data = this.data.filter(lora => lora.id !== id);
            
            // Remove from selected loras if present
            this.selectedLoras = this.selectedLoras.filter(i => i !== id);
            
            // Update count
            this.totalLoras = this.data.length;
            
            this.showNotification(
                `"${name}" was deleted successfully`,
                'success'
            );
        },

        /**
         * Handle lora errors from lora-card components
         * This method is called via @lora-error in the template
         */
        handleLoraError(detail) {
            const { error } = detail;
            this.showNotification(error, 'error');
            
            // Log error details for debugging
            if (window.DevLogger && window.DevLogger.error) {
                window.DevLogger.error('LoRA card error:', detail);
            }
        },

        /**
         * Load LoRA data using the integrated API data fetcher
         */
        async loadLoraData() {
            return this.fetchData(true, {
                view_mode: this.viewMode,
                search: this.searchTerm || undefined,
                is_active: this.filters.activeOnly || undefined,
                tags: this.filters.tags.length > 0 ? this.filters.tags : undefined,
                sort_by: this.sortBy
            });
        },

        /**
         * Calculate stats for the current data
         */
        calculateStats() {
            // Override this method to calculate stats if needed
            // For now, just update the total count
            this.totalLoras = this.dataCount;
        },

        /**
         * Show notification helper
         */
        showNotification(message, type = 'info') {
            if (typeof htmx !== 'undefined') {
                htmx.trigger(document.body, 'show-notification', {
                    detail: { message, type }
                });
            } else {
                window.DevLogger?.info?.(message);
            }
        },        initCards(container) {
            // Safety check for Alpine.js availability
            if (typeof Alpine === 'undefined') {
                window.DevLogger?.warn?.('Alpine.js not available for card initialization');
                return;
            }

            const cards = container.querySelectorAll('[x-data]');
            cards.forEach(card => {
                try {
                    // Only initialize if not already initialized
                    if (!card._x_dataStack) {
                        Alpine.initTree(card);
                    }
                } catch (error) {
                    window.DevLogger?.error?.('Error initializing Alpine.js component:', error);
                }
            });
        },

        // Expose this method globally as a fallback
        exposeGlobalMethods() {
            window.initLoraCards = this.initCards.bind(this);
        },
        
        async fetchAvailableTags() {
            try {
                const data = await fetchData((window?.BACKEND_URL || '') + '/adapters/tags');
                this.availableTags = data.tags;
            } catch (error) {
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error('Error fetching tags:', error);
                }
            }
        },

        applyFilters() {
            // Use the API data fetcher to reload data with new filters
            this.loadLoraData();
        },

        search() {
            this.applyFilters();
        },

        clearSearch() {
            this.searchTerm = '';
            this.search();
        },

        clearFilters() {
            this.searchTerm = '';
            this.filters.activeOnly = false;
            this.filters.tags = [];
            this.sortBy = 'name_asc';
            this.applyFilters();
        },

        toggleSelectAll() {
            this.allSelected = !this.allSelected;
            this.selectedLoras = [];
            
            const checkboxes = document.querySelectorAll('.lora-card-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = this.allSelected;
                const loraId = checkbox.dataset.loraId;
                if (this.allSelected) {
                    this.selectedLoras.push(loraId);
                }
            });
        },

        performBulkAction(action) {
            if (this.selectedLoras.length === 0) {
                if (typeof htmx !== 'undefined') {
                    htmx.trigger(document.body, 'show-notification', {
                        detail: { message: 'No LoRAs selected.', type: 'warning' }
                    });
                }
                return;
            }

            const confirmation = {
                'activate': 'Are you sure you want to activate the selected LoRAs?',
                'deactivate': 'Are you sure you want to deactivate the selected LoRAs?',
                'delete': 'Are you sure you want to permanently delete the selected LoRAs? This cannot be undone.'
            };

            if (!confirm(confirmation[action])) {
                return;
            }

            if (typeof htmx !== 'undefined') {
                htmx.ajax('POST', (window?.BACKEND_URL || '') + `/adapters/bulk-action`, {
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: action,
                        lora_ids: this.selectedLoras
                    }),
                    swap: 'none'
                }).then(response => {
                    if (response.ok) {
                        htmx.trigger(document.body, 'show-notification', {
                            detail: { message: `Successfully performed ${action} on ${this.selectedLoras.length} LoRAs.`, type: 'success' }
                        });
                        this.selectedLoras = [];
                        this.allSelected = false;
                        // Refresh the data after bulk action
                        this.loadLoraData();
                    } else {
                        response.text().then(text => {
                            const error = JSON.parse(text);
                            htmx.trigger(document.body, 'show-notification', {
                                detail: { message: `Error: ${error.detail}`, type: 'error' }
                            });
                        });
                    }
                });
            }
        }
    };
}

// Also export the individual functions for potential direct use
export { loraCard, initLoraCards };
