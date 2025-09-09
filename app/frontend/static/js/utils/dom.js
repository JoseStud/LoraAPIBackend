/**
 * DOM Utilities
 * 
 * Functions for DOM manipulation, element visibility,
 * and common DOM operations.
 */

/**
 * Show an element by removing the 'hidden' class
 * @param {HTMLElement|string} element - The element or selector
 */
export function showElement(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        el.classList.remove('hidden');
        el.removeAttribute('aria-hidden');
    }
}

/**
 * Hide an element by adding the 'hidden' class
 * @param {HTMLElement|string} element - The element or selector
 */
export function hideElement(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        el.classList.add('hidden');
        el.setAttribute('aria-hidden', 'true');
    }
}

/**
 * Toggle an element's visibility
 * @param {HTMLElement|string} element - The element or selector
 */
export function toggleElement(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        if (el.classList.contains('hidden')) {
            showElement(el);
        } else {
            hideElement(el);
        }
    }
}

/**
 * Check if an element is visible
 * @param {HTMLElement|string} element - The element or selector
 * @returns {boolean} True if visible, false otherwise
 */
export function isElementVisible(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (!el) return false;
    
    return !el.classList.contains('hidden') && 
           el.offsetWidth > 0 && 
           el.offsetHeight > 0;
}

/**
 * Scroll an element into view smoothly
 * @param {HTMLElement|string} element - The element or selector
 * @param {object} options - Scroll options
 */
export function scrollToElement(element, options = {}) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        el.scrollIntoView({
            behavior: 'smooth',
            block: 'start',
            ...options
        });
    }
}

/**
 * Add a CSS class to an element
 * @param {HTMLElement|string} element - The element or selector
 * @param {string} className - The class name to add
 */
export function addClass(element, className) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        el.classList.add(className);
    }
}

/**
 * Remove a CSS class from an element
 * @param {HTMLElement|string} element - The element or selector
 * @param {string} className - The class name to remove
 */
export function removeClass(element, className) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        el.classList.remove(className);
    }
}

/**
 * Toggle a CSS class on an element
 * @param {HTMLElement|string} element - The element or selector
 * @param {string} className - The class name to toggle
 * @returns {boolean} True if class was added, false if removed
 */
export function toggleClass(element, className) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        return el.classList.toggle(className);
    }
    return false;
}

/**
 * Get the value of a data attribute
 * @param {HTMLElement|string} element - The element or selector
 * @param {string} attribute - The data attribute name (without 'data-')
 * @returns {string|null} The attribute value
 */
export function getDataAttribute(element, attribute) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        return el.dataset[attribute] || null;
    }
    return null;
}

/**
 * Set the value of a data attribute
 * @param {HTMLElement|string} element - The element or selector
 * @param {string} attribute - The data attribute name (without 'data-')
 * @param {string} value - The attribute value
 */
export function setDataAttribute(element, attribute, value) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        el.dataset[attribute] = value;
    }
}
