/**
 * LoRA Card Component Module
 * Separated JavaScript logic for the lora-card component
 * Implements proper parent-child communication using Alpine's $dispatch
 */

import { postData, patchData, deleteData } from '../../utils/api.js';

/**
 * Creates a LoRA Card Alpine.js component
 * @param {Object} initialConfig - Initial configuration passed from the template
 * @returns {Object} Alpine.js component object
 */
function loraCard(initialConfig) {
    return {
        // Core properties from initial config
        id: initialConfig.id,
        active: initialConfig.active || false,
        name: initialConfig.name,
        version: initialConfig.version,
        description: initialConfig.description,
        tags: initialConfig.tags || [],
        preview_image: initialConfig.preview_image,
        quality_score: initialConfig.quality_score,
        type: initialConfig.type,
        
        // Component state
        viewMode: initialConfig.viewMode || 'grid',
        bulkMode: initialConfig.bulkMode || false,
        weight: initialConfig.weight || 1.0,
        isSelected: false,
        
        /**
         * Toggle the active state of the LoRA
         * Makes API call and updates the component state
         */
        async toggleActive() {
            const previousState = this.active;
            this.active = !this.active;
            
            try {
                const endpoint = this.active ? 'activate' : 'deactivate';
                const baseUrl = window?.BACKEND_URL || '';
                await postData(`${baseUrl}/adapters/${this.id}/${endpoint}`, {});
                
                // Dispatch event to notify parent components of state change
                this.$dispatch('lora-updated', {
                    id: this.id,
                    active: this.active,
                    type: 'activation'
                });
                
            } catch (error) {
                // Revert state on error
                this.active = previousState;
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error('Failed to toggle LoRA status:', error);
                }
                
                // Dispatch error event
                this.$dispatch('lora-error', {
                    id: this.id,
                    error: 'Failed to toggle LoRA status',
                    type: 'activation'
                });
            }
        },
        
        /**
         * Update the weight of the LoRA
         * Makes API call to persist the weight change
         */
        async updateWeight() {
            try {
                const baseUrl = window?.BACKEND_URL || '';
                // Use the general PATCH endpoint for adapter updates
                await patchData(`${baseUrl}/adapters/${this.id}`, { weight: parseFloat(this.weight) });
                
                // Dispatch event to notify parent components of weight change
                this.$dispatch('lora-updated', {
                    id: this.id,
                    weight: this.weight,
                    type: 'weight'
                });
                
            } catch (error) {
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error('Failed to update LoRA weight:', error);
                }
                
                // Dispatch error event
                this.$dispatch('lora-error', {
                    id: this.id,
                    error: 'Failed to update weight',
                    type: 'weight'
                });
            }
        },
        
        /**
         * Toggle selection state for bulk operations
         * Uses $dispatch for explicit parent-child communication
         */
        toggleSelection() {
            this.isSelected = !this.isSelected;
            
            // Dispatch selection-changed event with clear detail structure
            this.$dispatch('selection-changed', {
                id: this.id,
                selected: this.isSelected
            });
        },
        
        /**
         * Navigate to recommendations page for similar LoRAs
         */
        async getRecommendations() {
            // Navigate to recommendations page with this LoRA
            window.location.href = `/recommendations?similar=${this.id}`;
        },
        
        /**
         * Generate preview image for the LoRA
         */
        async generatePreview() {
            try {
                const baseUrl = window?.BACKEND_URL || '';
                await postData(`${baseUrl}/generation/preview/${this.id}`, {});
                
                // Dispatch success event
                this.$dispatch('lora-updated', {
                    id: this.id,
                    type: 'preview-generated'
                });
                
                // Show user feedback
                alert('Preview generation started');
            } catch (error) {
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error('Error generating preview:', error);
                }
                
                // Dispatch error event
                this.$dispatch('lora-error', {
                    id: this.id,
                    error: 'Error generating preview',
                    type: 'preview'
                });
                
                alert('Error generating preview');
            }
        },
        
        /**
         * Delete the LoRA with confirmation
         */
        async deleteLora() {
            const confirmMessage = `Delete ${this.name}? This cannot be undone.`;
            
            if (!confirm(confirmMessage)) {
                return;
            }
            
            try {
                const baseUrl = window?.BACKEND_URL || '';
                await deleteData(`${baseUrl}/adapters/${this.id}`);
                
                // Dispatch deletion event to parent
                this.$dispatch('lora-deleted', {
                    id: this.id,
                    name: this.name
                });
                
                // Remove the element from DOM
                this.$el.remove();
            } catch (error) {
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error('Error deleting LoRA:', error);
                }
                
                // Dispatch error event
                this.$dispatch('lora-error', {
                    id: this.id,
                    error: 'Failed to delete LoRA',
                    type: 'deletion'
                });
                
                alert('Failed to delete LoRA');
            }
        }
    };
}

/**
 * Register the component with Alpine.js when the DOM is ready
 */
document.addEventListener('alpine:init', () => {
    Alpine.data('loraCard', loraCard);
});

// Export for potential direct use in other modules
export { loraCard };
