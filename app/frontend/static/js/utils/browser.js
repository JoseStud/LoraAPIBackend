/**
 * Browser Utilities
 * 
 * Functions for browser-specific operations, file handling,
 * clipboard operations, and browser feature detection.
 */

/**
 * Generate a UUID v4
 * @returns {string} UUID string
 */
export function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Promise that resolves to true if successful
 */
export async function copyToClipboard(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.left = '-999999px';
            textArea.style.top = '-999999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            textArea.remove();
            return successful;
        }
    } catch (error) {
        return false;
    }
}

/**
 * Download a file from a URL or blob
 * @param {string|Blob} source - URL string or Blob object
 * @param {string} filename - Filename for the download
 */
export function downloadFile(source, filename) {
    const link = document.createElement('a');
    
    if (source instanceof Blob) {
        link.href = URL.createObjectURL(source);
    } else {
        link.href = source;
    }
    
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up object URL if it was created
    if (source instanceof Blob) {
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
    }
}

/**
 * Validate file type and size
 * @param {File} file - File to validate
 * @param {object} options - Validation options
 * @returns {object} Validation result
 */
export function validateFile(file, options = {}) {
    const {
        maxSize = 10 * 1024 * 1024, // 10MB default
        allowedTypes = [],
        allowedExtensions = []
    } = options;
    
    const result = {
        valid: true,
        errors: []
    };
    
    // Check file size
    if (file.size > maxSize) {
        result.valid = false;
        result.errors.push(`File size exceeds maximum allowed size of ${maxSize} bytes`);
    }
    
    // Check file type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
        result.valid = false;
        result.errors.push(`File type ${file.type} is not allowed`);
    }
    
    // Check file extension
    if (allowedExtensions.length > 0) {
        const extension = file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(extension)) {
            result.valid = false;
            result.errors.push(`File extension .${extension} is not allowed`);
        }
    }
    
    return result;
}

/**
 * Check if browser supports a feature
 * @param {string} feature - Feature name to check
 * @returns {boolean} True if supported
 */
export function supportsFeature(feature) {
    switch (feature) {
        case 'webgl':
            try {
                const canvas = document.createElement('canvas');
                return !!(window.WebGLRenderingContext && canvas.getContext('webgl'));
            } catch {
                return false;
            }
        
        case 'serviceworker':
            return 'serviceWorker' in navigator;
        
        case 'websocket':
            return 'WebSocket' in window;
        
        case 'geolocation':
            return 'geolocation' in navigator;
        
        case 'notifications':
            return 'Notification' in window;
        
        case 'vibration':
            return 'vibrate' in navigator;
        
        case 'clipboard':
            return 'clipboard' in navigator;
        
        case 'webrtc':
            return 'RTCPeerConnection' in window;
        
        default:
            return false;
    }
}

/**
 * Get browser information
 * @returns {object} Browser info object
 */
export function getBrowserInfo() {
    const ua = navigator.userAgent;
    const result = {
        name: 'Unknown',
        version: 'Unknown',
        mobile: /Mobile|Android|iPhone|iPad/.test(ua)
    };
    
    if (ua.includes('Chrome')) {
        result.name = 'Chrome';
        result.version = ua.match(/Chrome\/(\d+)/)?.[1] || 'Unknown';
    } else if (ua.includes('Firefox')) {
        result.name = 'Firefox';
        result.version = ua.match(/Firefox\/(\d+)/)?.[1] || 'Unknown';
    } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
        result.name = 'Safari';
        result.version = ua.match(/Version\/(\d+)/)?.[1] || 'Unknown';
    } else if (ua.includes('Edge')) {
        result.name = 'Edge';
        result.version = ua.match(/Edge\/(\d+)/)?.[1] || 'Unknown';
    }
    
    return result;
}

/**
 * Check if device is mobile
 * @returns {boolean} True if mobile device
 */
export function isMobile() {
    return /Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Get device pixel ratio
 * @returns {number} Device pixel ratio
 */
export function getDevicePixelRatio() {
    return window.devicePixelRatio || 1;
}

/**
 * Check if user prefers dark mode
 * @returns {boolean} True if dark mode preferred
 */
export function prefersDarkMode() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Check if user prefers reduced motion
 * @returns {boolean} True if reduced motion preferred
 */
export function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
