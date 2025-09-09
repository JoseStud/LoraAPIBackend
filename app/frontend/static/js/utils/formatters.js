/**
 * Formatter Utilities
 * 
 * Functions for formatting data, dates, numbers, and other values
 * for display in the user interface.
 */

/**
 * Format file size in bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    if (typeof bytes !== 'number' || bytes < 0) return 'Invalid size';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds to human readable format
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
export function formatDuration(ms) {
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
 * Format a date/time to relative time (e.g., "2 hours ago")
 * @param {Date|string|number} date - The date to format
 * @returns {string} Formatted relative time
 */
export function formatRelativeTime(date) {
    const now = new Date();
    const targetDate = new Date(date);
    
    if (isNaN(targetDate.getTime())) return 'Invalid date';
    
    const diffMs = now - targetDate;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffDays > 0) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else if (diffHours > 0) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffMinutes > 0) {
        return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else if (diffSeconds > 0) {
        return `${diffSeconds} second${diffSeconds > 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
}

/**
 * Format a number with thousands separators
 * @param {number} num - The number to format
 * @param {string} locale - The locale to use (default: 'en-US')
 * @returns {string} Formatted number
 */
export function formatNumber(num, locale = 'en-US') {
    if (typeof num !== 'number') return 'Invalid number';
    return num.toLocaleString(locale);
}

/**
 * Format a percentage
 * @param {number} value - The value (0-1 or 0-100)
 * @param {boolean} isDecimal - Whether the value is in decimal form (0-1)
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage
 */
export function formatPercentage(value, isDecimal = true, decimals = 1) {
    if (typeof value !== 'number') return 'Invalid percentage';
    
    const percentage = isDecimal ? value * 100 : value;
    return `${percentage.toFixed(decimals)}%`;
}

/**
 * Truncate text to a specified length
 * @param {string} text - The text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix to add when truncated (default: '...')
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength, suffix = '...') {
    if (typeof text !== 'string') return '';
    if (text.length <= maxLength) return text;
    
    return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Escape HTML in a string
 * @param {string} text - The text to escape
 * @returns {string} HTML-escaped text
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format a date to a locale-specific string
 * @param {Date|string|number} date - The date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @param {string} locale - The locale to use (default: 'en-US')
 * @returns {string} Formatted date
 */
export function formatDate(date, options = {}, locale = 'en-US') {
    const targetDate = new Date(date);
    
    if (isNaN(targetDate.getTime())) return 'Invalid date';
    
    const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options
    };
    
    return targetDate.toLocaleDateString(locale, defaultOptions);
}

/**
 * Format a date and time to a locale-specific string
 * @param {Date|string|number} date - The date to format
 * @param {object} options - Intl.DateTimeFormat options
 * @param {string} locale - The locale to use (default: 'en-US')
 * @returns {string} Formatted date and time
 */
export function formatDateTime(date, options = {}, locale = 'en-US') {
    const targetDate = new Date(date);
    
    if (isNaN(targetDate.getTime())) return 'Invalid date';
    
    const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        ...options
    };
    
    return targetDate.toLocaleDateString(locale, defaultOptions);
}
