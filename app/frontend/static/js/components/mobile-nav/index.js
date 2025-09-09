/**
 * Mobile Navigation Component Module
 */

export function createMobileNavComponent() {
    return {
        // Initialization state (required for x-show guards)
        isInitialized: false,
        
        isOpen: false,
        
        init() {
            // Initialize mobile navigation
            this.isInitialized = true;
        },
        
        toggleMenu() {
            this.isOpen = !this.isOpen;
        },
        
        closeMenu() {
            this.isOpen = false;
        }
    };
}
