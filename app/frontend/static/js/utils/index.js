/**
 * Shared JavaScript Utilities
 * 
 * Common utility functions used across the LoRA Manager frontend.
 * Provides file size formatting, progress simulation, date helpers, and more.
 */

/**
 * Format file size in bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    if (typeof bytes !== 'number' || bytes < 0) return 'Invalid size';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Simulate progress for long-running operations
 * @param {Function} updateCallback - Callback to update progress (receives percentage)
 * @param {Object} options - Options for progress simulation
 * @returns {Function} Function to stop progress simulation
 */
function simulateProgress(updateCallback, options = {}) {
    const {
        duration = 10000,        // Total duration in ms
        initialSpeed = 20,       // Initial progress speed
        slowDownAt = 80,         // Start slowing down at this percentage
        finalSpeed = 2,          // Final progress speed
        maxProgress = 95         // Don't go beyond this percentage
    } = options;
    
    let progress = 0;
    const startTime = Date.now();
    
    const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const timeProgress = (elapsed / duration) * 100;
        
        // Calculate speed based on progress
        let speed = initialSpeed;
        if (progress > slowDownAt) {
            const slowFactor = (progress - slowDownAt) / (100 - slowDownAt);
            speed = initialSpeed - (initialSpeed - finalSpeed) * slowFactor;
        }
        
        // Add some randomness
        const randomFactor = 0.5 + Math.random();
        progress += (speed * randomFactor) / 100;
        
        // Don't exceed max progress or 100%
        progress = Math.min(progress, maxProgress, timeProgress);
        
        updateCallback(Math.round(progress));
        
        // Stop if we've reached max progress or duration
        if (progress >= maxProgress || elapsed >= duration) {
            clearInterval(interval);
        }
    }, 100);
    
    // Return function to stop simulation
    return () => clearInterval(interval);
}

/**
 * Format duration in milliseconds to human readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
    if (typeof ms !== 'number' || ms < 0) return 'Invalid duration';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else if (seconds > 0) {
        return `${seconds}s`;
    } else {
        return `${ms}ms`;
    }
}

/**
 * Format relative time (e.g., "2 minutes ago")
 * @param {Date|string|number} date - Date to format
 * @returns {string} Relative time string
 */
function formatRelativeTime(date) {
    try {
        const now = new Date();
        const target = new Date(date);
        const diffMs = now - target;
        
        if (diffMs < 0) return 'in the future';
        
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffSeconds < 60) {
            return 'just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        } else if (diffDays < 7) {
            return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        } else {
            return target.toLocaleDateString();
        }
    } catch (error) {
        return 'Invalid date';
    }
}

/**
 * Debounce function execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @param {boolean} immediate - Execute immediately on first call
 * @returns {Function} Debounced function
 */
function debounce(func, wait, immediate = false) {
    let timeout;
    
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func.apply(this, args);
        };
        
        const callNow = immediate && !timeout;
        
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        
        if (callNow) func.apply(this, args);
    };
}

/**
 * Throttle function execution
 * @param {Function} func - Function to throttle
 * @param {number} limit - Time limit in milliseconds
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
    let inThrottle;
    
    return function executedFunction(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Safely parse JSON with fallback
 * @param {string} jsonString - JSON string to parse
 * @param {any} fallback - Fallback value if parsing fails
 * @returns {any} Parsed object or fallback
 */
function safeJSONParse(jsonString, fallback = null) {
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        if (window.DevLogger && window.DevLogger.warn) {
            window.DevLogger.warn('Failed to parse JSON:', error);
        }
        return fallback;
    }
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'absolute';
            textArea.style.left = '-999999px';
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            try {
                const successful = document.execCommand('copy');
                document.body.removeChild(textArea);
                return successful;
            } catch (error) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    } catch (error) {
        if (window.DevLogger && window.DevLogger.error) {
            window.DevLogger.error('Failed to copy to clipboard:', error);
        }
        return false;
    }
}

/**
 * Download data as file
 * @param {string|Blob} data - Data to download
 * @param {string} filename - Filename for download
 * @param {string} mimeType - MIME type (optional)
 */
function downloadFile(data, filename, mimeType = 'application/octet-stream') {
    try {
        let blob;
        
        if (data instanceof Blob) {
            blob = data;
        } else if (typeof data === 'string') {
            blob = new Blob([data], { type: mimeType });
        } else {
            blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        }
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up the URL object
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
        
    } catch (error) {
        if (window.DevLogger && window.DevLogger.error) {
            window.DevLogger.error('Failed to download file:', error);
        }
    }
}

/**
 * Validate file type and size
 * @param {File} file - File to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validateFile(file, options = {}) {
    const {
        maxSize = 10 * 1024 * 1024,  // 10MB default
        allowedTypes = [],            // Empty array allows all types
        allowedExtensions = []        // Empty array allows all extensions
    } = options;
    
    const result = {
        valid: true,
        errors: []
    };
    
    // Check file size
    if (file.size > maxSize) {
        result.valid = false;
        result.errors.push(`File size (${formatFileSize(file.size)}) exceeds limit (${formatFileSize(maxSize)})`);
    }
    
    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
        result.valid = false;
        result.errors.push(`File type (${file.type}) is not allowed`);
    }
    
    // Check file extension
    if (allowedExtensions.length > 0) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (!extension || !allowedExtensions.includes(extension)) {
            result.valid = false;
            result.errors.push(`File extension (.${extension}) is not allowed`);
        }
    }
    
    return result;
}

/**
 * Escape HTML entities
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add (default: '...')
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength, suffix = '...') {
    if (typeof text !== 'string') return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Wait for a specified time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Export all utilities
const Utils = {
    formatFileSize,
    simulateProgress,
    formatDuration,
    formatRelativeTime,
    debounce,
    throttle,
    generateUUID,
    safeJSONParse,
    copyToClipboard,
    downloadFile,
    validateFile,
    escapeHtml,
    truncateText,
    delay
};

// Make utilities available globally
if (typeof window !== 'undefined') {
    window.Utils = Utils;
    
    // Also make individual functions available for backward compatibility
    window.formatFileSize = formatFileSize;
    window.simulateProgress = simulateProgress;
    window.formatDuration = formatDuration;
    window.formatRelativeTime = formatRelativeTime;
    window.debounce = debounce;
    window.throttle = throttle;
    window.generateUUID = generateUUID;
    window.copyToClipboard = copyToClipboard;
    window.downloadFile = downloadFile;
}

// ES Module exports
export {
    formatFileSize,
    simulateProgress,
    formatDuration,
    formatRelativeTime,
    debounce,
    throttle,
    generateUUID,
    safeJSONParse,
    copyToClipboard,
    downloadFile,
    validateFile,
    escapeHtml,
    truncateText,
    delay
};

// Default export
export default Utils;

// Module export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Utils;
}
