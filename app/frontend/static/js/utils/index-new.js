/**
 * Shared JavaScript Utilities - Main Export
 * 
 * This file re-exports all utility functions from their respective modules
 * for easy importing and backward compatibility.
 */

// Import all utilities from specialized modules
export { 
    fetchData, 
    postData, 
    putData, 
    deleteData, 
    uploadFile 
} from './api.js';

export { 
    showElement, 
    hideElement, 
    toggleElement, 
    isElementVisible, 
    scrollToElement, 
    addClass, 
    removeClass, 
    toggleClass, 
    getDataAttribute, 
    setDataAttribute 
} from './dom.js';

export { 
    formatFileSize, 
    formatDuration, 
    formatRelativeTime, 
    formatNumber, 
    formatPercentage, 
    truncateText, 
    escapeHtml, 
    formatDate, 
    formatDateTime 
} from './formatters.js';

export { 
    delay, 
    debounce, 
    throttle, 
    retryWithBackoff, 
    withTimeout, 
    processBatches, 
    simulateProgress 
} from './async.js';

export { 
    generateUUID, 
    copyToClipboard, 
    downloadFile, 
    validateFile, 
    supportsFeature, 
    getBrowserInfo, 
    isMobile, 
    getDevicePixelRatio, 
    prefersDarkMode, 
    prefersReducedMotion 
} from './browser.js';

// Import functions for the Utils object
import { fetchData, postData, putData, deleteData, uploadFile } from './api.js';
import { showElement, hideElement, toggleElement, isElementVisible, scrollToElement, addClass, removeClass, toggleClass, getDataAttribute, setDataAttribute } from './dom.js';
import { formatFileSize, formatDuration, formatRelativeTime, formatNumber, formatPercentage, truncateText, escapeHtml, formatDate, formatDateTime } from './formatters.js';
import { delay, debounce, throttle, retryWithBackoff, withTimeout, processBatches, simulateProgress } from './async.js';
import { generateUUID, copyToClipboard, downloadFile, validateFile, supportsFeature, getBrowserInfo, isMobile, getDevicePixelRatio, prefersDarkMode, prefersReducedMotion } from './browser.js';

// Legacy Utils object for backward compatibility
const Utils = {
    // API utilities
    fetchData,
    postData,
    putData,
    deleteData,
    uploadFile,
    
    // DOM utilities
    showElement,
    hideElement,
    toggleElement,
    isElementVisible,
    scrollToElement,
    addClass,
    removeClass,
    toggleClass,
    getDataAttribute,
    setDataAttribute,
    
    // Formatters
    formatFileSize,
    formatDuration,
    formatRelativeTime,
    formatNumber,
    formatPercentage,
    truncateText,
    escapeHtml,
    formatDate,
    formatDateTime,
    
    // Async utilities
    delay,
    debounce,
    throttle,
    retryWithBackoff,
    withTimeout,
    processBatches,
    simulateProgress,
    
    // Browser utilities
    generateUUID,
    copyToClipboard,
    downloadFile,
    validateFile,
    supportsFeature,
    getBrowserInfo,
    isMobile,
    getDevicePixelRatio,
    prefersDarkMode,
    prefersReducedMotion
};

export default Utils;
