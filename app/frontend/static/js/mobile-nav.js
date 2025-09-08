/**
 * Mobile Navigation Component
 * Handles mobile menu toggle, touch gestures, and responsive behavior
 */

function mobileNav() {
    return {
        isOpen: false,
        
        init() {
            window.DevLogger?.debug?.('[MobileNav] Real implementation initialized');
            
            // Handle escape key
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.isOpen) {
                    this.closeMenu();
                }
            });
            
            // Handle orientation change
            window.addEventListener('orientationchange', () => {
                setTimeout(() => {
                    this.closeMenu();
                }, 200);
            });
            
            // Handle window resize
            window.addEventListener('resize', () => {
                if (window.innerWidth >= 1024) { // lg breakpoint
                    this.closeMenu();
                }
            });
            
            // Prevent body scroll when menu is open
            this.$watch('isOpen', (isOpen) => {
                if (isOpen) {
                    document.body.style.overflow = 'hidden';
                } else {
                    document.body.style.overflow = '';
                }
            });
        },
        
        toggleMenu() {
            this.isOpen = !this.isOpen;
        },
        
        closeMenu() {
            this.isOpen = false;
        },
        
        openMenu() {
            this.isOpen = true;
        }
    };
}

/**
 * Mobile Touch Utilities
 */
class MobileTouch {
    constructor() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchThreshold = 50;
        this.isScrolling = false;
        
        this.init();
    }
    
    init() {
        // Add touch event listeners for swipe gestures
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        
        // Add pull-to-refresh functionality
        this.initPullToRefresh();
        
        // Add haptic feedback for supported devices
        this.initHapticFeedback();
    }
    
    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
        this.isScrolling = false;
    }
    
    handleTouchMove(e) {
        if (!this.touchStartX || !this.touchStartY) return;
        
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        
        const diffX = this.touchStartX - touchX;
        const diffY = this.touchStartY - touchY;
        
        // Determine if this is a scroll or swipe
        if (Math.abs(diffY) > Math.abs(diffX)) {
            this.isScrolling = true;
        }
        
        // Handle swipe to open navigation
        if (!this.isScrolling && diffX < -this.touchThreshold && this.touchStartX < 50) {
            // Swipe right from left edge
            if (typeof window.Alpine !== 'undefined') {
                try {
                    const mobileNavComponent = Alpine.$data && Alpine.$data(document.body);
                    if (mobileNavComponent && mobileNavComponent.openMenu) {
                        mobileNavComponent.openMenu();
                    }
                } catch (e) {
                    // Alpine may not be fully initialized; ignore safely
                }
            }
        }
    }
    
    handleTouchEnd(_e) {
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.isScrolling = false;
    }
    
    initPullToRefresh() {
        let startY = 0;
        let currentY = 0;
        let isPulling = false;
        let refreshTriggered = false;
        
        const pullThreshold = 80;
        
        document.addEventListener('touchstart', (e) => {
            if (window.scrollY === 0) {
                startY = e.touches[0].clientY;
                isPulling = true;
                refreshTriggered = false;
            }
        }, { passive: true });
        
        document.addEventListener('touchmove', (e) => {
            if (!isPulling) return;
            
            currentY = e.touches[0].clientY;
            const pullDistance = currentY - startY;
            
            if (pullDistance > 0 && window.scrollY === 0) {
                e.preventDefault();
                
                const indicator = document.querySelector('.pull-refresh-indicator');
                if (indicator) {
                    if (pullDistance > pullThreshold && !refreshTriggered) {
                        indicator.classList.add('active');
                        this.vibrate(50); // Haptic feedback
                        refreshTriggered = true;
                    } else if (pullDistance <= pullThreshold && refreshTriggered) {
                        indicator.classList.remove('active');
                        refreshTriggered = false;
                    }
                }
            }
        }, { passive: false });
        
        document.addEventListener('touchend', () => {
            if (isPulling && refreshTriggered) {
                this.triggerRefresh();
            }
            
            isPulling = false;
            refreshTriggered = false;
            
            const indicator = document.querySelector('.pull-refresh-indicator');
            if (indicator) {
                indicator.classList.remove('active');
            }
        }, { passive: true });
    }
    
    initHapticFeedback() {
        // Add haptic feedback to buttons and interactive elements
        const addHapticToElements = (selector, intensity = 'light') => {
            document.addEventListener('click', (e) => {
                if (e.target.matches(selector)) {
                    this.vibrate(intensity === 'light' ? 10 : intensity === 'medium' ? 20 : 50);
                }
            });
        };
        
        addHapticToElements('.btn', 'light');
        addHapticToElements('.mobile-nav-link', 'light');
        addHapticToElements('.card-interactive', 'light');
        addHapticToElements('.mobile-fab', 'medium');
    }
    
    vibrate(duration) {
        if ('vibrate' in navigator) {
            navigator.vibrate(duration);
        }
    }
    
    triggerRefresh() {
        // Dispatch custom refresh event
        const refreshEvent = new CustomEvent('pullRefresh', {
            detail: { timestamp: Date.now() }
        });
        document.dispatchEvent(refreshEvent);
        
        // Show loading state
        this.showRefreshLoading();
    }
    
    showRefreshLoading() {
        const indicator = document.querySelector('.pull-refresh-indicator');
        if (indicator) {
            indicator.innerHTML = `
                <svg class="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
                </svg>
            `;
            
            // Hide after 2 seconds
            setTimeout(() => {
                indicator.innerHTML = `
                    <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path>
                    </svg>
                `;
            }, 2000);
        }
    }
}

/**
 * Mobile Performance Optimizations
 */
class MobilePerformance {
    constructor() {
        this.init();
    }
    
    init() {
        // Lazy load images
        this.initLazyLoading();
        
        // Optimize animations for mobile
        this.optimizeAnimations();
        
        // Add viewport height fix for mobile browsers
        this.fixViewportHeight();
        
        // Preload critical resources
        this.preloadCriticalResources();
    }
    
    initLazyLoading() {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.classList.remove('lazy');
                        observer.unobserve(img);
                    }
                });
            });
            
            document.querySelectorAll('img[data-src]').forEach(img => {
                imageObserver.observe(img);
            });
        }
    }
    
    optimizeAnimations() {
        // Reduce animations on low-end devices
        if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
            document.documentElement.classList.add('reduce-motion');
        }
        
        // Pause animations when page is not visible
        document.addEventListener('visibilitychange', () => {
            const animations = document.querySelectorAll('.animate-spin, .animate-pulse');
            animations.forEach(el => {
                if (document.hidden) {
                    el.style.animationPlayState = 'paused';
                } else {
                    el.style.animationPlayState = 'running';
                }
            });
        });
    }
    
    fixViewportHeight() {
        // Fix for mobile browsers where 100vh includes the address bar
        const setVH = () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        };
        
        setVH();
        window.addEventListener('resize', setVH);
        window.addEventListener('orientationchange', () => {
            setTimeout(setVH, 100);
        });
    }
    
    preloadCriticalResources() {
        // Preload critical images and fonts
        const criticalImages = [
            '/static/images/logo.svg'
        ];
        
        criticalImages.forEach(src => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = src;
            document.head.appendChild(link);
        });
    }
}

/**
 * Mobile Accessibility Enhancements
 */
class MobileAccessibility {
    constructor() {
        this.init();
    }
    
    init() {
        // Add focus management
        this.initFocusManagement();
        
        // Add screen reader announcements
        this.initScreenReaderSupport();
        
        // Add keyboard navigation for mobile
        this.initKeyboardNavigation();
    }
    
    initFocusManagement() {
        // Focus management for mobile menu
        document.addEventListener('alpineStore:mobileNav:opened', () => {
            const firstLink = document.querySelector('.mobile-nav-link');
            if (firstLink) {
                firstLink.focus();
            }
        });
        
        // Trap focus in mobile menu
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                const mobileMenu = document.querySelector('.mobile-nav-menu.open');
                if (mobileMenu) {
                    const focusableElements = mobileMenu.querySelectorAll(
                        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
                    );
                    
                    const firstElement = focusableElements[0];
                    const lastElement = focusableElements[focusableElements.length - 1];
                    
                    if (e.shiftKey && document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    } else if (!e.shiftKey && document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        });
    }
    
    initScreenReaderSupport() {
        // Add ARIA live region for announcements
        const liveRegion = document.createElement('div');
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.className = 'sr-only';
        liveRegion.id = 'mobile-announcements';
        document.body.appendChild(liveRegion);
        
        // Function to make announcements
        window.mobileAnnounce = (message) => {
            liveRegion.textContent = message;
            setTimeout(() => {
                liveRegion.textContent = '';
            }, 1000);
        };
    }
    
    initKeyboardNavigation() {
        // Add keyboard shortcuts for mobile
        document.addEventListener('keydown', (e) => {
                // Alt + M to toggle mobile menu
            if (e.altKey && e.key === 'm') {
                e.preventDefault();
                if (typeof window.Alpine !== 'undefined') {
                    try {
                        const mobileNavComponent = Alpine.$data && Alpine.$data(document.body);
                        if (mobileNavComponent && mobileNavComponent.toggleMenu) {
                            mobileNavComponent.toggleMenu();
                        }
                    } catch (e) { /* ignore if Alpine not ready */ }
                }
            }
        });
    }
}

// Register with ComponentLoader when available
if (window.ComponentLoader) {
    window.ComponentLoader.registerComponent('mobileNav', mobileNav);
} else {
    // Fallback: ensure global availability
    window.mobileNav = mobileNav;
}

// Initialize mobile enhancements when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MobileTouch();
    new MobilePerformance();
    new MobileAccessibility();
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mobileNav, MobileTouch, MobilePerformance, MobileAccessibility };
}
