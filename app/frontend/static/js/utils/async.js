/**
 * Async Operation Utilities
 * 
 * Functions for handling asynchronous operations, delays,
 * debouncing, throttling, and other async patterns.
 */

/**
 * Create a delay/sleep function
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after the delay
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Debounce a function - delays execution until after wait time has elapsed
 * @param {Function} func - The function to debounce
 * @param {number} wait - The wait time in milliseconds
 * @param {boolean} immediate - Whether to trigger on leading edge
 * @returns {Function} Debounced function
 */
export function debounce(func, wait, immediate = false) {
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
 * Throttle a function - limits execution to once per specified time period
 * @param {Function} func - The function to throttle
 * @param {number} limit - The time limit in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, limit) {
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
 * Retry an async operation with exponential backoff
 * @param {Function} operation - The async operation to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} Promise that resolves/rejects based on operation result
 */
export async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            if (attempt === maxRetries) {
                throw lastError;
            }
            
            const delayMs = baseDelay * Math.pow(2, attempt);
            await delay(delayMs);
        }
    }
}

/**
 * Execute async operations with a timeout
 * @param {Promise} promise - The promise to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} Promise that resolves/rejects based on operation or timeout
 */
export function withTimeout(promise, timeoutMs) {
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    return Promise.race([promise, timeoutPromise]);
}

/**
 * Execute async operations in batches
 * @param {Array} items - Items to process
 * @param {Function} processor - Async function to process each item
 * @param {number} batchSize - Number of items to process concurrently
 * @returns {Promise<Array>} Promise that resolves to array of results
 */
export async function processBatches(items, processor, batchSize = 5) {
    const results = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(processor));
        results.push(...batchResults);
    }
    
    return results;
}

/**
 * Simulate progress for long-running operations
 * @param {Function} updateCallback - Callback to update progress (receives percentage)
 * @param {Object} options - Options for progress simulation
 * @returns {Function} Function to stop progress simulation
 */
export function simulateProgress(updateCallback, options = {}) {
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
