/**
 * Import/Export Component - UI Utilities Module
 * 
 * Handles UI-related functionality including formatting, toasts,
 * and progress tracking.
 */

/**
 * UI utility functions
 */
const importExportUI = {
    /**
     * Formats file size in human readable format
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    /**
     * Formats date in human readable format
     */
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    },
    
    /**
     * Shows toast notification
     */
    showToast(state, message, type = 'info', duration = 3000) {
        state.toastMessage = message;
        state.toastType = type;
        state.showToast = true;
        
        setTimeout(() => {
            state.showToast = false;
        }, duration);
    },
    
    /**
     * Updates progress and scrolls to bottom of messages
     */
    updateProgress(state, { value, step, message }) {
        if (value !== undefined) state.progressValue = value;
        if (step !== undefined) state.currentStep = step;
        
        if (message !== undefined) {
            state.progressMessages.push({
                id: Date.now(),
                text: `[${new Date().toLocaleTimeString()}] ${message}`
            });
            
            // Scroll to bottom of progress messages
            setTimeout(() => {
                const container = document.querySelector('.max-h-40.overflow-y-auto');
                if (container) {
                    container.scrollTop = container.scrollHeight;
                }
            }, 100);
        }
    },
    
    /**
     * Simulates a progress operation with callbacks
     */
    async simulateProgressOperation(steps, progressCallback, stepDelay = 1000) {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            const progress = Math.round(((i + 1) / steps.length) * 100);
            
            if (progressCallback) {
                progressCallback({
                    value: progress,
                    step: step.step,
                    message: step.step
                });
            }
            
            // Wait for step completion
            const delay = step.duration || stepDelay;
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    },
    
    /**
     * Handles drag and drop visual feedback
     */
    handleDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        
        // Add visual feedback
        const dropZone = event.currentTarget;
        if (dropZone) {
            dropZone.classList.add('border-blue-500', 'bg-blue-50');
        }
    },
    
    /**
     * Handles drag leave visual feedback
     */
    handleDragLeave(event) {
        const dropZone = event.currentTarget;
        if (dropZone) {
            dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        }
    },
    
    /**
     * Handles file drop with visual feedback cleanup
     */
    handleDrop(event) {
        event.preventDefault();
        
        // Remove visual feedback
        const dropZone = event.currentTarget;
        if (dropZone) {
            dropZone.classList.remove('border-blue-500', 'bg-blue-50');
        }
        
        return Array.from(event.dataTransfer.files);
    },
    
    /**
     * Gets CSS classes for status indicators
     */
    getStatusClasses(status) {
        const statusClasses = {
            'new': 'bg-green-100 text-green-800',
            'conflict': 'bg-yellow-100 text-yellow-800',
            'existing': 'bg-gray-100 text-gray-800',
            'convert': 'bg-blue-100 text-blue-800',
            'compatible': 'bg-green-100 text-green-800',
            'error': 'bg-red-100 text-red-800'
        };
        
        return statusClasses[status] || 'bg-gray-100 text-gray-800';
    },
    
    /**
     * Gets icon for file types
     */
    getTypeIcon(type) {
        const typeIcons = {
            'LoRA': '🎯',
            'Generation': '🖼️',
            'Config': '⚙️',
            'User Data': '👤',
            'Database': '🗃️',
            'Settings': '📋',
            'Cache': '💾',
            'Models': '🧠',
            'Workflows': '🔄',
            'Extensions': '🧩',
            'Embeddings': '📝',
            'VAE': '🎨',
            'Outputs': '📤'
        };
        
        return typeIcons[type] || '📄';
    },
    
    /**
     * Validates and formats user input
     */
    validateInput(value, type) {
        switch (type) {
            case 'password':
                return {
                    valid: value.length >= 8,
                    message: value.length < 8 ? 'Password must be at least 8 characters' : ''
                };
            case 'path':
                return {
                    valid: value.trim().length > 0,
                    message: value.trim().length === 0 ? 'Path is required' : ''
                };
            case 'number': {
                const num = parseInt(value);
                return {
                    valid: !isNaN(num) && num > 0,
                    message: isNaN(num) || num <= 0 ? 'Must be a positive number' : ''
                };
            }
            case 'date': {
                const date = new Date(value);
                return {
                    valid: !isNaN(date.getTime()),
                    message: isNaN(date.getTime()) ? 'Invalid date format' : ''
                };
            }
            default:
                return { valid: true, message: '' };
        }
    },
    
    /**
     * Generates download trigger
     */
    triggerDownload(url, filename) {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },
    
    /**
     * Copies text to clipboard
     */
    async copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            const success = document.execCommand('copy');
            document.body.removeChild(textArea);
            return success;
        }
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { importExportUI };
} else if (typeof window !== 'undefined') {
    window.importExportUI = importExportUI;
}
