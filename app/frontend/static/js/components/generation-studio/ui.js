/**
 * Generation Studio - UI Utilities Module
 * 
 * Handles UI utilities, notifications, formatting, and user interaction helpers.
 */

/**
 * UI utilities for generation studio
 */
const generationUI = {
    /**
     * Toast notification management
     */
    toast: {
        /**
         * Shows a toast notification
         */
        show(message, type = 'success', duration = 3000) {
            if (!message) return;
            
            const toastEvent = new CustomEvent('toast-show', {
                detail: {
                    message: String(message),
                    type: this.validateToastType(type),
                    duration: Math.max(1000, duration),
                    timestamp: Date.now()
                }
            });
            
            // Dispatch for browser runtime
            try { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(toastEvent); } catch {}
            // Ensure test stubs on global.window are called too
            try {
                if (typeof global !== 'undefined' && global.window && global.window !== window && typeof global.window.dispatchEvent === 'function') {
                    global.window.dispatchEvent(toastEvent);
                }
            } catch {}
            
            return {
                message,
                type,
                duration
            };
        },
        
        /**
         * Validates toast type
         */
        validateToastType(type) {
            const validTypes = ['success', 'error', 'warning', 'info'];
            return validTypes.includes(type) ? type : 'info';
        },
        
        /**
         * Shows success toast
         */
        success(message, duration) {
            return this.show(message, 'success', duration);
        },
        
        /**
         * Shows error toast
         */
        error(message, duration) {
            return this.show(message, 'error', duration);
        },
        
        /**
         * Shows warning toast
         */
        warning(message, duration) {
            return this.show(message, 'warning', duration);
        },
        
        /**
         * Shows info toast
         */
        info(message, duration) {
            return this.show(message, 'info', duration);
        }
    },
    
    /**
     * Modal management
     */
    modal: {
        /**
         * Shows a modal
         */
        show(modalId, data = null) {
            const modalEvent = new CustomEvent('modal-show', {
                detail: {
                    modalId,
                    data,
                    timestamp: Date.now()
                }
            });
            
            try { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(modalEvent); } catch {}
            try {
                if (typeof global !== 'undefined' && global.window && global.window !== window && typeof global.window.dispatchEvent === 'function') {
                    global.window.dispatchEvent(modalEvent);
                }
            } catch {}
            return true;
        },
        
        /**
         * Hides a modal
         */
        hide(modalId) {
            const modalEvent = new CustomEvent('modal-hide', {
                detail: {
                    modalId,
                    timestamp: Date.now()
                }
            });
            
            try { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(modalEvent); } catch {}
            try {
                if (typeof global !== 'undefined' && global.window && global.window !== window && typeof global.window.dispatchEvent === 'function') {
                    global.window.dispatchEvent(modalEvent);
                }
            } catch {}
            return true;
        },
        
        /**
         * Shows image modal with result data
         */
        showImage(result) {
            return this.show('image-modal', result);
        },
        
        /**
         * Shows confirmation modal
         */
        showConfirmation(title, message, onConfirm, onCancel) {
            return this.show('confirmation-modal', {
                title,
                message,
                onConfirm,
                onCancel
            });
        }
    },
    
    /**
     * URL parameter handling
     */
    url: {
        /**
         * Gets URL parameters
         */
        getParams() {
            const params = new URLSearchParams(window.location.search);
            const result = {};
            
            for (const [key, value] of params) {
                result[key] = this.parseValue(value);
            }
            
            return result;
        },
        
        /**
         * Sets URL parameters without page reload
         */
        setParams(params, replace = false) {
            const url = new URL(window.location);
            
            Object.entries(params).forEach(([key, value]) => {
                if (value === null || value === undefined || value === '') {
                    url.searchParams.delete(key);
                } else {
                    url.searchParams.set(key, String(value));
                }
            });
            
            const method = replace ? 'replaceState' : 'pushState';
            window.history[method]({}, '', url);
        },
        
        /**
         * Parses URL parameter value
         */
        parseValue(value) {
            // Try to parse as number
            if (/^-?\d+(\.\d+)?$/.test(value)) {
                return Number(value);
            }
            
            // Try to parse as boolean
            if (value === 'true') return true;
            if (value === 'false') return false;
            
            // Return as string
            return value;
        },
        
        /**
         * Loads generation parameters from URL
         */
        loadGenerationParams() {
            const params = this.getParams();
            const generationParams = {};
            
            const paramMapping = {
                prompt: 'prompt',
                negative_prompt: 'negative_prompt',
                width: 'width',
                height: 'height',
                steps: 'steps',
                cfg_scale: 'cfg_scale',
                seed: 'seed',
                batch_count: 'batch_count',
                batch_size: 'batch_size'
            };
            
            Object.entries(paramMapping).forEach(([urlKey, paramKey]) => {
                if (params[urlKey] !== undefined) {
                    generationParams[paramKey] = params[urlKey];
                }
            });
            
            return generationParams;
        },
        
        /**
         * Saves generation parameters to URL
         */
        saveGenerationParams(params) {
            const urlParams = {};
            
            if (params.prompt) urlParams.prompt = params.prompt;
            if (params.negative_prompt) urlParams.negative_prompt = params.negative_prompt;
            if (params.width !== 512) urlParams.width = params.width;
            if (params.height !== 512) urlParams.height = params.height;
            if (params.steps !== 20) urlParams.steps = params.steps;
            if (params.cfg_scale !== 7.0) urlParams.cfg_scale = params.cfg_scale;
            if (params.seed !== -1) urlParams.seed = params.seed;
            if (params.batch_count !== 1) urlParams.batch_count = params.batch_count;
            if (params.batch_size !== 1) urlParams.batch_size = params.batch_size;
            
            this.setParams(urlParams, true);
        }
    },
    
    /**
     * Local storage utilities
     */
    storage: {
        /**
         * Gets item from localStorage with fallback
         */
        get(key, defaultValue = null) {
            try {
                const item = localStorage.getItem(key);
                return item !== null ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.warn('Failed to get from localStorage:', error);
                return defaultValue;
            }
        },
        
        /**
         * Sets item in localStorage
         */
        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.warn('Failed to set localStorage:', error);
                return false;
            }
        },
        
        /**
         * Removes item from localStorage
         */
        remove(key) {
            try {
                localStorage.removeItem(key);
                return true;
            } catch (error) {
                console.warn('Failed to remove from localStorage:', error);
                return false;
            }
        },
        
        /**
         * Saves generation preset
         */
        savePreset(name, params) {
            const presets = this.get('generationPresets', []);
            
            const preset = {
                id: Date.now().toString(),
                name,
                params: { ...params },
                created_at: new Date().toISOString()
            };
            
            presets.push(preset);
            this.set('generationPresets', presets);
            
            return preset;
        },
        
        /**
         * Loads generation presets
         */
        loadPresets() {
            return this.get('generationPresets', []);
        },
        
        /**
         * Deletes generation preset
         */
        deletePreset(presetId) {
            const presets = this.get('generationPresets', []);
            const filtered = presets.filter(preset => preset.id !== presetId);
            this.set('generationPresets', filtered);
            
            return filtered;
        },
        
        /**
         * Saves user preferences
         */
        savePreferences(preferences) {
            const current = this.get('userPreferences', {});
            const updated = { ...current, ...preferences };
            this.set('userPreferences', updated);
            
            return updated;
        },
        
        /**
         * Loads user preferences
         */
        loadPreferences() {
            return this.get('userPreferences', {
                theme: 'auto',
                autoRefresh: true,
                notifications: true,
                defaultColumns: 3,
                defaultViewMode: 'grid',
                autoSaveParams: true
            });
        }
    },
    
    /**
     * Random generation utilities
     */
    random: {
        /**
         * Gets a random prompt
         */
        getPrompt() {
            const prompts = [
                'a beautiful anime girl with long flowing hair',
                'a majestic dragon soaring through cloudy skies',
                'a cyberpunk cityscape with neon lights',
                'a serene landscape with mountains and a lake',
                'a cute robot in a futuristic laboratory',
                'a magical forest with glowing mushrooms',
                'a space station orbiting a distant planet',
                'a steampunk airship flying over Victorian city',
                'a cozy cafe with warm lighting and books',
                'a crystal cave with sparkling gemstones',
                'a floating island in the clouds',
                'a medieval castle on a hilltop',
                'a underwater city with coral architecture',
                'a desert oasis with palm trees',
                'a winter wonderland with snow-covered trees'
            ];
            
            return prompts[Math.floor(Math.random() * prompts.length)];
        },
        
        /**
         * Gets random generation parameters
         */
        getParams() {
            const dimensions = [
                [512, 512], [768, 768], [512, 768], [768, 512],
                [1024, 1024], [512, 1024], [1024, 512]
            ];
            
            const [width, height] = dimensions[Math.floor(Math.random() * dimensions.length)];
            
            return {
                width,
                height,
                steps: 15 + Math.floor(Math.random() * 35), // 15-50
                cfg_scale: 5 + Math.random() * 10, // 5-15
                seed: Math.floor(Math.random() * 1000000)
            };
        },
        
        /**
         * Gets random seed
         */
        getSeed() {
            return Math.floor(Math.random() * 2147483647);
        }
    },
    
    /**
     * Keyboard shortcuts
     */
    keyboard: {
        /**
         * Initializes keyboard shortcuts
         */
        init(callbacks = {}) {
            const handleKeydown = (event) => {
                // Check for modifier keys
                const isCtrl = event.ctrlKey || event.metaKey;
                const isShift = event.shiftKey;
                const isAlt = event.altKey;
                
                // Prevent shortcuts when typing in input fields
                if (this.isInputFocused()) return;
                
                const key = event.key.toLowerCase();
                
                // Ctrl/Cmd shortcuts
                if (isCtrl && !isShift && !isAlt) {
                    switch (key) {
                        case 'enter':
                            event.preventDefault();
                            if (callbacks.startGeneration) callbacks.startGeneration();
                            break;
                        case 'r':
                            event.preventDefault();
                            if (callbacks.refreshResults) callbacks.refreshResults();
                            break;
                        case 's':
                            event.preventDefault();
                            if (callbacks.savePreset) callbacks.savePreset();
                            break;
                    }
                }
                
                // Alt shortcuts
                if (isAlt && !isCtrl && !isShift) {
                    switch (key) {
                        case 'q':
                            event.preventDefault();
                            if (callbacks.clearQueue) callbacks.clearQueue();
                            break;
                        case 'p':
                            event.preventDefault();
                            if (callbacks.randomPrompt) callbacks.randomPrompt();
                            break;
                    }
                }
                
                // Simple key shortcuts
                if (!isCtrl && !isShift && !isAlt) {
                    switch (key) {
                        case 'escape':
                            if (callbacks.closeModal) callbacks.closeModal();
                            break;
                        case 'f5':
                            event.preventDefault();
                            if (callbacks.refreshResults) callbacks.refreshResults();
                            break;
                    }
                }
            };
            
            document.addEventListener('keydown', handleKeydown);
            
            return () => {
                document.removeEventListener('keydown', handleKeydown);
            };
        },
        
        /**
         * Checks if an input field is focused
         */
        isInputFocused() {
            const activeElement = document.activeElement;
            return activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.isContentEditable
            );
        }
    },
    
    /**
     * Download utilities
     */
    download: {
        /**
         * Downloads a blob as a file
         */
        blob(blob, filename) {
            try {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                return true;
            } catch (error) {
                console.error('Failed to download blob:', error);
                return false;
            }
        },
        
        /**
         * Downloads data as JSON file
         */
        json(data, filename) {
            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            return this.blob(blob, filename);
        },
        
        /**
         * Downloads image from URL
         */
        async image(imageUrl, filename) {
            try {
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error('Failed to fetch image');
                
                const blob = await response.blob();
                return this.blob(blob, filename);
            } catch (error) {
                console.error('Failed to download image:', error);
                return false;
            }
        }
    },
    
    /**
     * Clipboard utilities
     */
    clipboard: {
        /**
         * Copies text to clipboard
         */
        async copyText(text) {
            try {
                if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    await navigator.clipboard.writeText(text);
                } else if (typeof global !== 'undefined' && global.navigator && global.navigator.clipboard && typeof global.navigator.clipboard.writeText === 'function') {
                    await global.navigator.clipboard.writeText(text);
                } else {
                    throw new Error('Clipboard API unavailable');
                }
                return true;
            } catch (error) {
                // Fallback for older browsers
                return this.fallbackCopyText(text);
            }
        },
        
        /**
         * Fallback method for copying text
         */
        fallbackCopyText(text) {
            try {
                const textArea = document.createElement('textarea');
                textArea.value = text;
                textArea.style.position = 'fixed';
                textArea.style.top = '-1000px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                
                return successful;
            } catch (error) {
                console.error('Failed to copy text:', error);
                return false;
            }
        },
        
        /**
         * Copies result parameters to clipboard
         */
        async copyParams(params) {
            const paramsText = Object.entries(params)
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n');
            
            return this.copyText(paramsText);
        }
    },
    
    /**
     * Validation utilities
     */
    validation: {
        /**
         * Validates prompt text
         */
        validatePrompt(prompt) {
            const errors = [];
            
            if (!prompt || !prompt.trim()) {
                errors.push('Prompt is required');
            } else if (prompt.length > 1000) {
                errors.push('Prompt is too long (max 1000 characters)');
            }
            
            return {
                isValid: errors.length === 0,
                errors
            };
        },
        
        /**
         * Validates email address
         */
        validateEmail(email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        },
        
        /**
         * Validates URL
         */
        validateUrl(url) {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        }
    },
    
    /**
     * Animation utilities
     */
    animation: {
        /**
         * Smoothly scrolls to element
         */
        scrollTo(element, offset = 0) {
            if (!element) return;
            
            const targetPosition = element.offsetTop + offset;
            
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        },
        
        /**
         * Fades in element
         */
        fadeIn(element, duration = 300) {
            if (!element) return;
            
            element.style.opacity = '0';
            element.style.transition = `opacity ${duration}ms ease-in-out`;
            
            setTimeout(() => {
                element.style.opacity = '1';
            }, 10);
        },
        
        /**
         * Fades out element
         */
        fadeOut(element, duration = 300) {
            if (!element) return;
            
            element.style.transition = `opacity ${duration}ms ease-in-out`;
            element.style.opacity = '0';
            
            setTimeout(() => {
                element.style.display = 'none';
            }, duration);
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationUI };
} else if (typeof window !== 'undefined') {
    window.generationUI = generationUI;
}
