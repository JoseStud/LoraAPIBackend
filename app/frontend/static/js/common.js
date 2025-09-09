/**
 * LoRA Manager - Common JavaScript Functions
 * 
 * Shared functions for the LoRA Manager frontend that can be used
 * across multiple components and templates.
 */

/**
 * LoRA Management Functions
 */
window.LoRAManager = {
    /**
     * Navigate to LoRA details page
     * @param {string} loraId - The LoRA ID
     */
    viewLoraDetails(loraId) {
        window.location.href = `/loras/${loraId}`;
    },

    /**
     * Toggle LoRA active status
     * @param {string} loraId - The LoRA ID
     * @param {boolean} isActive - Current active status
     * @returns {Promise<boolean>} - Success status
     */
    async toggleLoraActive(loraId, isActive) {
        try {
            const endpoint = isActive ? 'deactivate' : 'activate';
            const response = await fetch(`/api/adapters/${loraId}/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                // Dispatch event for other components to update
                const event = new CustomEvent('lora-status-changed', { 
                    detail: { loraId, isActive: !isActive }
                });
                document.body.dispatchEvent(event);
                return true;
            } else {
                window.DevLogger && window.DevLogger.error && window.DevLogger.error('Failed to update LoRA status:', response.status);
                this.showError('Failed to update LoRA status');
                return false;
            }
        } catch (error) {
            window.DevLogger && window.DevLogger.error && window.DevLogger.error('Error updating LoRA status:', error);
            this.showError('Error: ' + error.message);
            return false;
        }
    },

    /**
     * Apply LoRA to a prompt input
     * @param {string} loraId - The LoRA ID
     * @param {string} loraName - The LoRA name
     * @param {string} inputSelector - CSS selector for the prompt input
     */
    applyToPrompt(loraId, loraName, inputSelector = '#prompt-input') {
        const promptInput = document.querySelector(inputSelector);
        if (promptInput) {
            const currentPrompt = promptInput.value.trim();
            const loraTag = `<lora:${loraName}:1.0>`;
            
            // Add LoRA tag if not already present
            if (!currentPrompt.includes(loraTag)) {
                promptInput.value = currentPrompt ? `${currentPrompt} ${loraTag}` : loraTag;
                promptInput.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
        
        // Also activate the LoRA
        this.toggleLoraActive(loraId, false);
    },

    /**
     * Show error message to user
     * @param {string} message - Error message
     */
    showError(message) {
        // Simple alert for now, could be enhanced with a toast system
        alert(message);
    },

    /**
     * Show success message to user
     * @param {string} message - Success message
     */
    showSuccess(message) {
    // Simple alert for now, could be enhanced with a toast system
    window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('Success:', message);
    }
};

/**
 * HTMX Utilities
 */
window.HTMXUtils = {
    /**
     * Trigger a custom HTMX event
     * @param {string} eventName - The event name
     * @param {object} detail - Event detail data
     */
    triggerEvent(eventName, detail = {}) {
        document.body.dispatchEvent(new CustomEvent(eventName, { detail }));
    },

    /**
     * Refresh a specific HTMX element
     * @param {string} selector - CSS selector for the element
     */
    refreshElement(selector) {
        const element = document.querySelector(selector);
        if (element && element.hasAttribute('hx-get')) {
            htmx.trigger(element, 'refresh');
        }
    },

    /**
     * Show loading state for an element
     * @param {string} selector - CSS selector for the element
     */
    showLoading(selector) {
        try {
            if (!selector || typeof selector !== 'string' || selector.trim() === '' || selector === '#') {
                window.DevLogger && window.DevLogger.warn && window.DevLogger.warn('showLoading: invalid selector', selector);
                return;
            }
            const element = document.querySelector(selector);
            if (element) element.classList.add('htmx-loading');
        } catch (e) {
            // Invalid selector; ignore to avoid DOMException
            window.DevLogger && window.DevLogger.warn && window.DevLogger.warn('showLoading: invalid selector', selector, e);
        }
    },

    /**
     * Hide loading state for an element
     * @param {string} selector - CSS selector for the element
     */
    hideLoading(selector) {
        try {
            if (!selector || typeof selector !== 'string' || selector.trim() === '' || selector === '#') {
                window.DevLogger && window.DevLogger.warn && window.DevLogger.warn('hideLoading: invalid selector', selector);
                return;
            }
            const element = document.querySelector(selector);
            if (element) element.classList.remove('htmx-loading');
        } catch (e) {
            window.DevLogger && window.DevLogger.warn && window.DevLogger.warn('hideLoading: invalid selector', selector, e);
        }
    }
};

/**
 * Alpine.js Utilities and Global Functions
 */
window.AlpineUtils = {
    /**
     * Normalize recommendation weights to sum to 1.0
     * @param {object} weights - Weight object with semantic, artistic, technical
     * @param {string} changedKey - The key that was just changed
     * @returns {object} - Normalized weights
     */
    normalizeWeights(weights, changedKey) {
        const total = weights.semantic + weights.artistic + weights.technical;
        
        if (total > 1.0) {
            const excess = total - 1.0;
            const others = Object.keys(weights).filter(k => k !== changedKey);
            others.forEach(key => {
                weights[key] = Math.max(0, weights[key] - excess / others.length);
            });
        }
        
        // Ensure all weights sum to 1.0
        const newTotal = weights.semantic + weights.artistic + weights.technical;
        if (Math.abs(newTotal - 1.0) > 0.01) {
            const factor = 1.0 / newTotal;
            weights.semantic *= factor;
            weights.artistic *= factor;
            weights.technical *= factor;
        }
        
        // Round to 1 decimal place
        weights.semantic = Math.round(weights.semantic * 10) / 10;
        weights.artistic = Math.round(weights.artistic * 10) / 10;
        weights.technical = Math.round(weights.technical * 10) / 10;
        
        return weights;
    },

    /**
     * Debounce function for input handlers
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} - Debounced function
     */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    /**
     * Format file size for display
     * @param {number} bytes - Size in bytes
     * @returns {string} - Formatted size string
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    /**
     * Format timestamp for display
     * @param {string} timestamp - ISO timestamp string
     * @returns {string} - Formatted timestamp
     */
    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString();
    }
};

/**
 * Initialize common event listeners
 */
document.addEventListener('DOMContentLoaded', function() {
    // Global HTMX event listeners
    document.body.addEventListener('htmx:beforeRequest', function(event) {
        try {
            const id = event.target && event.target.id ? event.target.id.trim() : null;
            if (id && id.length > 0 && id !== '#') {
                HTMXUtils.showLoading('#' + id);
            }
        } catch (e) { window.DevLogger && window.DevLogger.warn && window.DevLogger.warn('htmx:beforeRequest handler error', e); }
    });

    document.body.addEventListener('htmx:afterRequest', function(event) {
        try {
            const id = event.target && event.target.id ? event.target.id.trim() : null;
            if (id && id.length > 0 && id !== '#') {
                HTMXUtils.hideLoading('#' + id);
            }
        
            // Handle errors
            if (event.detail && event.detail.xhr && event.detail.xhr.status >= 400) {
                LoRAManager.showError('Request failed with status: ' + event.detail.xhr.status);
            }
        } catch (e) { window.DevLogger && window.DevLogger.warn && window.DevLogger.warn('htmx:afterRequest handler error', e); }
    });

    // Global keyboard shortcuts
    document.addEventListener('keydown', function(event) {
        // Ctrl/Cmd + K for quick search
        if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
            event.preventDefault();
            const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]');
            if (searchInput) {
                searchInput.focus();
            }
        }
    });
});

/**
 * Global functions for template usage
 */
window.viewLoraDetails = window.LoRAManager.viewLoraDetails;
window.toggleLoraActive = window.LoRAManager.toggleLoraActive;
window.applyToPrompt = window.LoRAManager.applyToPrompt;
