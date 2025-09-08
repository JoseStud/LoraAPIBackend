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
        // Minimal logging in production; keep guard to avoid breaking when evt.detail is absent
        try {
            if (evt && evt.detail && evt.detail.requestConfig && evt.detail.requestConfig.url) {
                // Use centralized DevLogger (falls back to console when available)
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('HTMX request starting:', evt.detail.requestConfig.url);
            }
        } catch (e) { /* ignore */ }
    });
    
    document.body.addEventListener('htmx:afterRequest', function(evt) {
        // Handle response (only log at debug level)
        try {
            if (evt && evt.detail && evt.detail.xhr) {
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('HTMX request completed:', evt.detail.xhr.status);

                if (evt.detail.xhr.status >= 400) {
                    // Show error notification, only if Alpine and notifications store are available
                    try {
                        if (window.Alpine && typeof Alpine.store === 'function') {
                            const notifications = Alpine.store('notifications');
                            if (notifications && typeof notifications.add === 'function') {
                                notifications.add(`Request failed: ${evt.detail.xhr.status}`, 'error');
                            }
                        }
                    } catch (e) {
                        // fail silently
                    }
                }
            }
        } catch (e) {
            // swallow any errors to avoid HTMX handler crashes
        }
    });
    
    document.body.addEventListener('htmx:responseError', function(evt) {
            try {
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('HTMX response error:', evt && evt.detail);
            if (window.Alpine && typeof Alpine.store === 'function') {
                const notifications = Alpine.store('notifications');
                if (notifications && typeof notifications.add === 'function') {
                    notifications.add('Network error occurred', 'error');
                }
            }
        } catch (e) { /* fail silently */ }
    });
    
    document.body.addEventListener('htmx:timeout', function(evt) {
            try {
                window.DevLogger && window.DevLogger.debug && window.DevLogger.debug('HTMX request timeout:', evt && evt.detail);
            if (window.Alpine && typeof Alpine.store === 'function') {
                const notifications = Alpine.store('notifications');
                if (notifications && typeof notifications.add === 'function') {
                    notifications.add('Request timed out', 'error');
                }
            }
        } catch (e) { /* fail silently */ }
    });
    
    // Custom HTMX extensions
    htmx.defineExtension('json-enc', {
        onEvent: function(name, evt) {
            if (name === 'htmx:configRequest') {
                evt.detail.headers['Content-Type'] = 'application/json';
            }
        },
        
        encodeParameters: function(xhr, parameters, _elt) {
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
            element.addEventListener('input', (_e) => {
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
