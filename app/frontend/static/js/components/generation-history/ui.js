/**
 * Generation History - UI Management Module
 * 
 * Handles UI interactions, view modes, modal management, and keyboard shortcuts.
 */

/**
 * UI management operations for generation history
 */
const generationHistoryUI = {
    /**
     * Handles keyboard shortcuts
     */
    handleKeyboard(event, state, callbacks = {}) {
        switch (event.key) {
            case 'Escape':
                if (state.showModal) {
                    if (callbacks.closeModal) callbacks.closeModal();
                    return true;
                } else if (state.selectedItems.length > 0) {
                    if (callbacks.clearSelection) callbacks.clearSelection();
                    return true;
                }
                break;
                
            case 'Delete':
                if (state.selectedItems.length > 0) {
                    if (callbacks.deleteSelected) callbacks.deleteSelected();
                    return true;
                }
                break;
                
            case 'a':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    if (callbacks.selectAll) callbacks.selectAll();
                    return true;
                }
                break;
                
            case 'f':
                if (event.ctrlKey || event.metaKey) {
                    event.preventDefault();
                    if (callbacks.focusSearch) callbacks.focusSearch();
                    return true;
                }
                break;
                
            case 'g':
                if (!event.ctrlKey && !event.metaKey) {
                    if (callbacks.toggleViewMode) callbacks.toggleViewMode('grid');
                    return true;
                }
                break;
                
            case 'l':
                if (!event.ctrlKey && !event.metaKey) {
                    if (callbacks.toggleViewMode) callbacks.toggleViewMode('list');
                    return true;
                }
                break;
                
            case 'ArrowLeft':
                if (state.showModal && state.selectedResult) {
                    if (callbacks.navigateModal) callbacks.navigateModal('previous');
                    return true;
                }
                break;
                
            case 'ArrowRight':
                if (state.showModal && state.selectedResult) {
                    if (callbacks.navigateModal) callbacks.navigateModal('next');
                    return true;
                }
                break;
        }
        
        return false;
    },
    
    /**
     * Sets up keyboard event listeners
     */
    setupKeyboardListeners(callbacks) {
        const handleKeydown = (event) => {
            // Only handle if we're not in an input field
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }
            
            this.handleKeyboard(event, callbacks.getState(), callbacks);
        };
        
        document.addEventListener('keydown', handleKeydown);
        
        // Return cleanup function
        return () => {
            document.removeEventListener('keydown', handleKeydown);
        };
    },
    
    /**
     * Manages modal navigation
     */
    getModalNavigation(currentResult, allResults) {
        const currentIndex = allResults.findIndex(r => r.id === currentResult.id);
        
        return {
            currentIndex,
            total: allResults.length,
            hasPrevious: currentIndex > 0,
            hasNext: currentIndex < allResults.length - 1,
            previousResult: currentIndex > 0 ? allResults[currentIndex - 1] : null,
            nextResult: currentIndex < allResults.length - 1 ? allResults[currentIndex + 1] : null
        };
    },
    
    /**
     * Handles grid layout calculations
     */
    calculateGridLayout(containerWidth, minItemWidth = 200, gap = 16) {
        const availableWidth = containerWidth - gap;
        const itemsPerRow = Math.floor(availableWidth / (minItemWidth + gap));
        const actualItemWidth = (availableWidth - (itemsPerRow - 1) * gap) / itemsPerRow;
        
        return {
            itemsPerRow: Math.max(1, itemsPerRow),
            itemWidth: Math.max(minItemWidth, actualItemWidth),
            gap
        };
    },
    
    /**
     * Handles infinite scroll detection
     */
    setupInfiniteScroll(callback, threshold = 200) {
        let isLoading = false;
        
        const handleScroll = () => {
            if (isLoading) return;
            
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const windowHeight = window.innerHeight;
            const docHeight = document.documentElement.scrollHeight;
            
            if (scrollTop + windowHeight >= docHeight - threshold) {
                isLoading = true;
                callback().finally(() => {
                    isLoading = false;
                });
            }
        };
        
        window.addEventListener('scroll', handleScroll, { passive: true });
        
        // Return cleanup function
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    },
    
    /**
     * Manages drag and drop selection
     */
    setupDragSelection(containerSelector, itemSelector, onSelectionChange) {
        let isDragging = false;
        let startX, startY;
        let selectionBox = null;
        let originalSelection = [];
        
        const container = document.querySelector(containerSelector);
        if (!container) return null;
        
        const startDrag = (event) => {
            if (event.target.closest(itemSelector)) return;
            
            isDragging = true;
            startX = event.clientX;
            startY = event.clientY;
            originalSelection = [...(onSelectionChange.getSelected() || [])];
            
            // Create selection box
            selectionBox = document.createElement('div');
            selectionBox.className = 'selection-box';
            selectionBox.style.cssText = `
                position: fixed;
                border: 2px dashed #3b82f6;
                background: rgba(59, 130, 246, 0.1);
                pointer-events: none;
                z-index: 1000;
            `;
            document.body.appendChild(selectionBox);
            
            event.preventDefault();
        };
        
        const updateDrag = (event) => {
            if (!isDragging || !selectionBox) return;
            
            const currentX = event.clientX;
            const currentY = event.clientY;
            
            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);
            
            selectionBox.style.left = `${left}px`;
            selectionBox.style.top = `${top}px`;
            selectionBox.style.width = `${width}px`;
            selectionBox.style.height = `${height}px`;
            
            // Check intersections with items
            const selectionRect = selectionBox.getBoundingClientRect();
            const items = container.querySelectorAll(itemSelector);
            const selectedIds = [];
            
            items.forEach(item => {
                const itemRect = item.getBoundingClientRect();
                if (this.rectsIntersect(selectionRect, itemRect)) {
                    const itemId = item.dataset.id;
                    if (itemId) selectedIds.push(itemId);
                }
            });
            
            // Combine with original selection
            const newSelection = [...new Set([...originalSelection, ...selectedIds])];
            onSelectionChange.setSelected(newSelection);
        };
        
        const endDrag = () => {
            isDragging = false;
            if (selectionBox) {
                document.body.removeChild(selectionBox);
                selectionBox = null;
            }
        };
        
        container.addEventListener('mousedown', startDrag);
        document.addEventListener('mousemove', updateDrag);
        document.addEventListener('mouseup', endDrag);
        
        // Return cleanup function
        return () => {
            container.removeEventListener('mousedown', startDrag);
            document.removeEventListener('mousemove', updateDrag);
            document.removeEventListener('mouseup', endDrag);
            if (selectionBox) {
                document.body.removeChild(selectionBox);
            }
        };
    },
    
    /**
     * Checks if two rectangles intersect
     */
    rectsIntersect(rect1, rect2) {
        return !(rect1.right < rect2.left || 
                rect1.left > rect2.right || 
                rect1.bottom < rect2.top || 
                rect1.top > rect2.bottom);
    },
    
    /**
     * Handles responsive breakpoints
     */
    getResponsiveConfig(windowWidth) {
        if (windowWidth < 640) {
            // Mobile
            return {
                viewMode: 'grid',
                itemsPerRow: 2,
                minItemWidth: 140,
                gap: 8,
                showSidebar: false
            };
        } else if (windowWidth < 1024) {
            // Tablet
            return {
                viewMode: 'grid',
                itemsPerRow: 3,
                minItemWidth: 180,
                gap: 12,
                showSidebar: false
            };
        } else {
            // Desktop
            return {
                viewMode: 'grid',
                itemsPerRow: 4,
                minItemWidth: 200,
                gap: 16,
                showSidebar: true
            };
        }
    },
    
    /**
     * Manages view transitions
     */
    animateViewChange(fromMode, toMode, duration = 300) {
        const container = document.querySelector('.history-grid, .history-list');
        if (!container) return Promise.resolve();
        
        return new Promise(resolve => {
            container.style.transition = `opacity ${duration}ms ease-in-out`;
            container.style.opacity = '0';
            
            setTimeout(() => {
                container.classList.remove(`view-${fromMode}`);
                container.classList.add(`view-${toMode}`);
                container.style.opacity = '1';
                
                setTimeout(() => {
                    container.style.transition = '';
                    resolve();
                }, duration);
            }, duration / 2);
        });
    },
    
    /**
     * Handles image lazy loading
     */
    setupLazyLoading(imageSelector = 'img[data-src]') {
        if ('IntersectionObserver' in window) {
            const imageObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const img = entry.target;
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        observer.unobserve(img);
                    }
                });
            });
            
            document.querySelectorAll(imageSelector).forEach(img => {
                imageObserver.observe(img);
            });
            
            return () => imageObserver.disconnect();
        } else {
            // Fallback for browsers without IntersectionObserver
            document.querySelectorAll(imageSelector).forEach(img => {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            });
            
            return () => {};
        }
    },
    
    /**
     * Manages focus navigation
     */
    setupFocusNavigation(containerSelector, itemSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) return null;
        
        let focusedIndex = -1;
        
        const handleKeyNavigation = (event) => {
            const items = container.querySelectorAll(itemSelector);
            if (items.length === 0) return;
            
            switch (event.key) {
                case 'ArrowDown':
                case 'ArrowRight':
                    event.preventDefault();
                    focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
                    items[focusedIndex].focus();
                    break;
                    
                case 'ArrowUp':
                case 'ArrowLeft':
                    event.preventDefault();
                    focusedIndex = Math.max(focusedIndex - 1, 0);
                    items[focusedIndex].focus();
                    break;
                    
                case 'Home':
                    event.preventDefault();
                    focusedIndex = 0;
                    items[focusedIndex].focus();
                    break;
                    
                case 'End':
                    event.preventDefault();
                    focusedIndex = items.length - 1;
                    items[focusedIndex].focus();
                    break;
            }
        };
        
        container.addEventListener('keydown', handleKeyNavigation);
        
        return () => {
            container.removeEventListener('keydown', handleKeyNavigation);
        };
    },
    
    /**
     * Creates a loading skeleton
     */
    createLoadingSkeleton(count = 8) {
        const skeletons = [];
        
        for (let i = 0; i < count; i++) {
            skeletons.push({
                id: `skeleton-${i}`,
                isLoading: true,
                className: 'animate-pulse bg-gray-200'
            });
        }
        
        return skeletons;
    },
    
    /**
     * Gets CSS classes for different UI states
     */
    getStateClasses(state) {
        return {
            container: [
                'history-container',
                state.viewMode === 'grid' ? 'grid-view' : 'list-view',
                state.isLoading ? 'loading' : '',
                state.selectedItems.length > 0 ? 'has-selection' : ''
            ].filter(Boolean).join(' '),
            
            item: (item, isSelected) => [
                'history-item',
                isSelected ? 'selected' : '',
                item.is_favorite ? 'favorite' : '',
                item.rating > 0 ? 'rated' : ''
            ].filter(Boolean).join(' '),
            
            modal: [
                'history-modal',
                state.showModal ? 'visible' : 'hidden'
            ].join(' ')
        };
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generationHistoryUI };
} else if (typeof window !== 'undefined') {
    window.generationHistoryUI = generationHistoryUI;
}
