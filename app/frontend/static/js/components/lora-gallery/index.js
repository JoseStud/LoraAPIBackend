/**
 * LoRA Gallery Component Module
 * Complete implementation with bulk operations and filtering
 */

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
            
            this.isInitialized = true;
        },
        
        fetchAvailableTags() {
            fetch('/api/v1/tags')
                .then(response => response.json())
                .then(data => {
                    this.availableTags = data.tags;
                })
                .catch(error => console.error('Error fetching tags:', error));
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
