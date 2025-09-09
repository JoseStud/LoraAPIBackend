/**
 * LoRA Gallery Component Module
 * Complete implementation with bulk operations and filtering
 */

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

        toggleActive() {
            const previousState = this.active;
            this.active = !this.active;
            
            // Make API call to update the active state
            fetch(`/api/v1/loras/${this.id}/toggle-active`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ active: this.active })
            })
            .then(response => {
                if (!response.ok) {
                    // Revert on error
                    this.active = previousState;
                    throw new Error('Failed to update LoRA status');
                }
                return response.json();
            })
            .then(data => {
                // Update with server response
                this.active = data.active;
                
                // Trigger a refresh of the gallery
                document.body.dispatchEvent(new CustomEvent('lora-data-updated'));
            })
            .catch(error => {
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.error('Error toggling LoRA active state:', error);
                }
                this.active = previousState; // Revert to previous state
            });
        },

        toggleExpanded() {
            this.isExpanded = !this.isExpanded;
        },

        async loadDetails() {
            if (this.isLoading) return;
            this.isLoading = true;
            
            try {
                // Load additional details for the LoRA card
                const response = await fetch(`/api/v1/loras/${this.id}/details`);
                if (response.ok) {
                    const details = await response.json();
                    // Update the card with additional details
                    Object.assign(this, details);
                }
            } catch (error) {
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.error('Error loading LoRA details:', error);
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
        
        // Data
        loras: [],
        isLoading: false,
        
        // Computed property for filtered LoRAs
        get filteredLoras() {
            let filtered = this.loras;
            
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

            // Listen for selection updates from lora-card components
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

            // Legacy listener for backward compatibility
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
            
            // Trigger initial data load
            setTimeout(() => {
                htmx.trigger(document.body, 'lora-data-updated');
            }, 100);
        },

        initCards(container) {
            // Safety check for Alpine.js availability
            if (typeof Alpine === 'undefined') {
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.warn('Alpine.js not available for card initialization');
                }
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
                    if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        console.error('Error initializing Alpine.js component:', error);
                    }
                }
            });
        },

        // Expose this method globally as a fallback
        exposeGlobalMethods() {
            window.initLoraCards = this.initCards.bind(this);
        },
        
        fetchAvailableTags() {
            fetch('/api/v1/tags')
                .then(response => response.json())
                .then(data => {
                    this.availableTags = data.tags;
                })
                .catch(error => {
                    if (import.meta.env.DEV) {
                        // eslint-disable-next-line no-console
                        console.error('Error fetching tags:', error);
                    }
                });
        },

        applyFilters() {
            const params = new URLSearchParams();
            params.append('view_mode', this.viewMode);
            if (this.searchTerm) {
                params.append('search', this.searchTerm);
            }
            if (this.filters.activeOnly) {
                params.append('is_active', 'true');
            }
            this.filters.tags.forEach(tag => {
                params.append('tags', tag);
            });
            params.append('sort_by', this.sortBy);
            
            if (this.bulkMode) {
                params.append('bulk_mode', 'true');
            }

            // Use HTMX if available, otherwise fall back to standard navigation
            if (typeof htmx !== 'undefined') {
                const url = `/loras?${params.toString()}`;
                htmx.ajax('GET', url, { target: '#lora-container', swap: 'innerHTML' });
            }
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
                htmx.ajax('POST', `/api/v1/loras/bulk-action`, {
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
                        htmx.trigger(document.body, 'lora-data-updated');
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
