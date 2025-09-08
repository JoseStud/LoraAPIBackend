/**
 * Development Logger Module
 * 
 * Provides a centralized logging abstraction for development and debugging.
 * Allows runtime control of logging levels and output formatting.
 */

/**
 * Logger class with configurable levels and output
 */
class DevLogger {
    constructor() {
        this.enabled = true;
        this.level = 'debug'; // debug, info, warn, error
        this.prefix = '[LoRA-Manager]';
        this.timestamp = true;
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
    }

    /**
     * Set logging configuration
     * @param {Object} config - Configuration object
     */
    configure(config) {
        if (config.enabled !== undefined) this.enabled = config.enabled;
        if (config.level !== undefined) this.level = config.level;
        if (config.prefix !== undefined) this.prefix = config.prefix;
        if (config.timestamp !== undefined) this.timestamp = config.timestamp;
    }

    /**
     * Check if a log level should be output
     * @param {string} level - Log level to check
     * @returns {boolean} True if level should be logged
     */
    shouldLog(level) {
        if (!this.enabled) return false;
        return this.levels[level] >= this.levels[this.level];
    }

    /**
     * Format log message with prefix and timestamp
     * @param {string} level - Log level
     * @param {Array} args - Arguments to log
     * @returns {Array} Formatted arguments
     */
    formatMessage(level, args) {
        const parts = [];
        
        if (this.timestamp) {
            parts.push(new Date().toISOString());
        }
        
        if (this.prefix) {
            parts.push(this.prefix);
        }
        
        parts.push(`[${level.toUpperCase()}]`);
        
        return [parts.join(' '), ...args];
    }

    /**
     * Log debug message
     * @param {...any} args - Arguments to log
     */
    debug(...args) {
        if (!this.shouldLog('debug')) return;
        
        const formatted = this.formatMessage('debug', args);
        
        /* eslint-disable no-console */
        if (typeof console !== 'undefined' && console.log) {
            console.log(...formatted);
        }
        /* eslint-enable no-console */
    }

    /**
     * Log info message
     * @param {...any} args - Arguments to log
     */
    info(...args) {
        if (!this.shouldLog('info')) return;
        
        const formatted = this.formatMessage('info', args);
        
        /* eslint-disable no-console */
        if (typeof console !== 'undefined' && console.info) {
            console.info(...formatted);
        } else if (typeof console !== 'undefined' && console.log) {
            console.log(...formatted);
        }
        /* eslint-enable no-console */
    }

    /**
     * Log warning message
     * @param {...any} args - Arguments to log
     */
    warn(...args) {
        if (!this.shouldLog('warn')) return;
        
        const formatted = this.formatMessage('warn', args);
        
        /* eslint-disable no-console */
        if (typeof console !== 'undefined' && console.warn) {
            console.warn(...formatted);
        } else if (typeof console !== 'undefined' && console.log) {
            console.log(...formatted);
        }
        /* eslint-enable no-console */
    }

    /**
     * Log error message
     * @param {...any} args - Arguments to log
     */
    error(...args) {
        if (!this.shouldLog('error')) return;
        
        const formatted = this.formatMessage('error', args);
        
        /* eslint-disable no-console */
        if (typeof console !== 'undefined' && console.error) {
            console.error(...formatted);
        } else if (typeof console !== 'undefined' && console.log) {
            console.log(...formatted);
        }
        /* eslint-enable no-console */
    }

    /**
     * Create a scoped logger with a specific prefix
     * @param {string} scope - Scope name
     * @returns {Object} Scoped logger object
     */
    scope(scope) {
        return {
            debug: (...args) => this.debug(`[${scope}]`, ...args),
            info: (...args) => this.info(`[${scope}]`, ...args),
            warn: (...args) => this.warn(`[${scope}]`, ...args),
            error: (...args) => this.error(`[${scope}]`, ...args)
        };
    }

    /**
     * Create a timer for performance logging
     * @param {string} label - Timer label
     * @returns {Function} Function to end the timer
     */
    timer(label) {
        const start = performance.now();
        this.debug(`Timer started: ${label}`);
        
        return () => {
            const end = performance.now();
            const duration = (end - start).toFixed(2);
            this.debug(`Timer ended: ${label} (${duration}ms)`);
            return duration;
        };
    }

    /**
     * Log object with pretty formatting
     * @param {string} label - Object label
     * @param {any} obj - Object to log
     */
    object(label, obj) {
        if (!this.shouldLog('debug')) return;
        
        this.debug(`${label}:`, obj);
    }

    /**
     * Create a group of related log messages
     * @param {string} label - Group label
     * @param {Function} fn - Function to execute in group
     */
    group(label, fn) {
        if (!this.shouldLog('debug')) {
            fn();
            return;
        }

        /* eslint-disable no-console */
        if (typeof console !== 'undefined' && console.group) {
            console.group(this.formatMessage('debug', [label]).join(' '));
            try {
                fn();
            } finally {
                if (console.groupEnd) {
                    console.groupEnd();
                }
            }
        } else {
            this.debug(`--- ${label} ---`);
            fn();
            this.debug(`--- End ${label} ---`);
        }
        /* eslint-enable no-console */
    }

    /**
     * Log performance mark
     * @param {string} name - Mark name
     */
    mark(name) {
        if (!this.shouldLog('debug')) return;
        
        if (typeof performance !== 'undefined' && performance.mark) {
            performance.mark(name);
        }
        this.debug(`Performance mark: ${name}`);
    }

    /**
     * Measure performance between two marks
     * @param {string} name - Measure name
     * @param {string} startMark - Start mark name
     * @param {string} endMark - End mark name
     */
    measure(name, startMark, endMark) {
        if (!this.shouldLog('debug')) return;
        
        if (typeof performance !== 'undefined' && performance.measure) {
            try {
                performance.measure(name, startMark, endMark);
                const measure = performance.getEntriesByName(name, 'measure')[0];
                if (measure) {
                    this.debug(`Performance measure: ${name} (${measure.duration.toFixed(2)}ms)`);
                }
            } catch (error) {
                this.debug(`Performance measure failed: ${name}`, error);
            }
        }
    }
}

/**
 * Create logger instance based on environment
 * @returns {DevLogger|Object} Logger instance or no-op logger
 */
function createLogger() {
    // Check if we're in development mode
    const isDev = (
        typeof window !== 'undefined' && 
        (window.__DEV_CONSOLE__ || window.location?.hostname === 'localhost')
    );

    if (isDev) {
        return new DevLogger();
    } else {
        // Production no-op logger
        return {
            configure: () => {},
            debug: () => {},
            info: () => {},
            warn: () => {},
            error: () => {},
            scope: () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }),
            timer: () => () => {},
            object: () => {},
            group: (label, fn) => fn(),
            mark: () => {},
            measure: () => {}
        };
    }
}

// Create singleton logger instance
const logger = createLogger();

// Make available globally for backward compatibility
if (typeof window !== 'undefined') {
    // Set up the global DevLogger interface
    window.DevLogger = {
        debug: (...args) => logger.debug(...args),
        info: (...args) => logger.info(...args),
        warn: (...args) => logger.warn(...args),
        error: (...args) => logger.error(...args),
        scope: (scope) => logger.scope(scope),
        timer: (label) => logger.timer(label),
        object: (label, obj) => logger.object(label, obj),
        group: (label, fn) => logger.group(label, fn),
        configure: (config) => logger.configure(config)
    };

    // Set up legacy interface for backward compatibility
    if (!window.__DEV_LOG_IMPL__) {
        window.__DEV_LOG_IMPL__ = {
            debug: (...args) => logger.debug(...args),
            warn: (...args) => logger.warn(...args),
            error: (...args) => logger.error(...args)
        };
    }

    // Enable console by default in development
    if (typeof window.__DEV_CONSOLE__ === 'undefined') {
        window.__DEV_CONSOLE__ = (window.location?.hostname === 'localhost');
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DevLogger, createLogger, logger };
} else if (typeof window !== 'undefined') {
    window.DevLogger.DevLogger = DevLogger;
    window.DevLogger.createLogger = createLogger;
    window.DevLogger.logger = logger;
}
