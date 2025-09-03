// HTMX Configuration and Custom Extensions
// This file configures HTMX for the LoRA Manager frontend

document.addEventListener('DOMContentLoaded', function() {
    // HTMX Configuration
    htmx.config.requestClass = 'htmx-request';
    htmx.config.addedClass = 'htmx-added';
    htmx.config.settlingClass = 'htmx-settling';
    htmx.config.swappingClass = 'htmx-swapping';
    htmx.config.allowEval = false;
    htmx.config.allowScriptTags = false;
    htmx.config.historyCacheSize = 10;
    htmx.config.refreshOnHistoryMiss = false;
    htmx.config.defaultSwapStyle = 'innerHTML';
    htmx.config.timeout = 30000; // 30 seconds
    
    // Global HTMX event handlers
    document.body.addEventListener('htmx:configRequest', function(evt) {
        // Add API key to requests if available
        const apiKey = localStorage.getItem('lora_manager_api_key');
        if (apiKey) {
            evt.detail.headers['X-API-Key'] = apiKey;
        }
        
        // Add content type for JSON requests
        if (evt.detail.verb !== 'GET') {
            evt.detail.headers['Content-Type'] = 'application/json';
        }
    });
    
    document.body.addEventListener('htmx:beforeRequest', function(evt) {
        // Show loading state
        console.log('HTMX request starting:', evt.detail.requestConfig.url);
    });
    
    document.body.addEventListener('htmx:afterRequest', function(evt) {
        // Handle response
        console.log('HTMX request completed:', evt.detail.xhr.status);
        
        if (evt.detail.xhr.status >= 400) {
            console.error('HTMX request failed:', evt.detail.xhr.status, evt.detail.xhr.responseText);
            
            // Show error notification
            if (window.Alpine) {
                Alpine.store('notifications').add(
                    `Request failed: ${evt.detail.xhr.status}`,
                    'error'
                );
            }
        }
    });
    
    document.body.addEventListener('htmx:responseError', function(evt) {
        console.error('HTMX response error:', evt.detail);
        
        if (window.Alpine) {
            Alpine.store('notifications').add(
                'Network error occurred',
                'error'
            );
        }
    });
    
    document.body.addEventListener('htmx:timeout', function(evt) {
        console.error('HTMX request timeout:', evt.detail);
        
        if (window.Alpine) {
            Alpine.store('notifications').add(
                'Request timed out',
                'error'
            );
        }
    });
    
    // Custom HTMX extensions
    htmx.defineExtension('json-enc', {
        onEvent: function(name, evt) {
            if (name === 'htmx:configRequest') {
                evt.detail.headers['Content-Type'] = 'application/json';
            }
        },
        
        encodeParameters: function(xhr, parameters, elt) {
            xhr.overrideMimeType('application/json');
            return JSON.stringify(parameters);
        }
    });
    
    // Custom HTMX extension for Alpine.js integration
    htmx.defineExtension('alpine-morph', {
        isInlineSwap: function(swapStyle) {
            return swapStyle === 'alpine-morph';
        },
        
        handleSwap: function(swapStyle, target, fragment) {
            if (swapStyle === 'alpine-morph') {
                if (window.Alpine) {
                    // Use Alpine's morph for smoother transitions
                    Alpine.morph(target, fragment.firstElementChild);
                    return true;
                }
            }
            return false;
        }
    });
});

// Custom HTMX helpers
window.HTMXHelpers = {
    // Trigger HTMX request programmatically
    trigger(element, event, options = {}) {
        htmx.trigger(element, event, options);
    },
    
    // Add HTMX attributes to element
    process(element) {
        htmx.process(element);
    },
    
    // Remove HTMX from element
    remove(element) {
        htmx.remove(element);
    },
    
    // Custom swap with Alpine.js integration
    swapWithAlpine(target, content) {
        if (window.Alpine) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;
            Alpine.morph(target, tempDiv.firstElementChild);
        } else {
            target.innerHTML = content;
        }
    },
    
    // Debounced trigger for search inputs
    debouncedTrigger: null,
    setupDebouncedSearch(element, delay = 300) {
        element.addEventListener('input', (e) => {
            clearTimeout(this.debouncedTrigger);
            this.debouncedTrigger = setTimeout(() => {
                htmx.trigger(element, 'search-input');
            }, delay);
        });
    }
};

// Global functions for HTMX templates
window.htmxGlobals = {
    // Format values for display
    formatFileSize(bytes) {
        return window.LoRAManager?.formatFileSize(bytes) || `${bytes} bytes`;
    },
    
    formatTimestamp(timestamp) {
        return window.LoRAManager?.formatTimestamp(timestamp) || timestamp;
    },
    
    // Show confirmation dialog
    confirmAction(message, callback) {
        if (confirm(message)) {
            callback();
        }
    },
    
    // Copy to clipboard
    copyToClipboard(text) {
        window.LoRAManager?.copyToClipboard(text);
    },
    
    // Show/hide elements
    toggleElement(selector) {
        const element = document.querySelector(selector);
        if (element) {
            element.classList.toggle('hidden');
        }
    },
    
    // Smooth scroll to element
    scrollToElement(selector) {
        const element = document.querySelector(selector);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    }
};

// Initialize HTMX helpers on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    // Setup debounced search for all search inputs
    document.querySelectorAll('[data-search-input]').forEach(input => {
        window.HTMXHelpers.setupDebouncedSearch(input);
    });
    
    // Setup global keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Ctrl/Cmd + K for search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.querySelector('[data-global-search]');
            if (searchInput) {
                searchInput.focus();
            }
        }
        
        // Escape to close modals
        if (e.key === 'Escape') {
            const modal = document.querySelector('.modal-overlay:not(.hidden)');
            if (modal) {
                modal.classList.add('hidden');
            }
        }
    });
});
