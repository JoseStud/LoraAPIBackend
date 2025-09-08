/**
 * PWA Manager - UI Management Module
 * 
 * Handles notifications, indicators, prompts, and other UI elements for PWA.
 */

/**
 * UI management operations for PWA components
 */
const pwaUI = {
    /**
     * Shows a notification toast
     */
    showNotification(title, message, type = 'info', options = {}) {
        const {
            duration = 5000,
            position = 'top-right',
            dismissible = true,
            className = 'pwa-notification'
        } = options;
        
        const toast = this.createNotificationElement(title, message, type, className, dismissible);
        this.positionNotification(toast, position);
        
        document.body.appendChild(toast);
        
        // Animate in
        setTimeout(() => toast.classList.add('enter-active'), 100);
        
        // Auto-remove
        if (duration > 0) {
            setTimeout(() => this.removeNotification(toast), duration);
        }
        
        return {
            element: toast,
            remove: () => this.removeNotification(toast)
        };
    },
    
    /**
     * Creates notification element
     */
    createNotificationElement(title, message, type, className, dismissible) {
        const toast = document.createElement('div');
        toast.className = `${className} mobile-toast ${type}`;
        
        const dismissButton = dismissible ? `
            <button class="toast-dismiss ml-2 text-gray-400 hover:text-gray-600">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        ` : '';
        
        toast.innerHTML = `
            <div class="flex items-start space-x-3">
                <div class="flex-shrink-0">
                    ${this.getNotificationIcon(type)}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="font-semibold">${title}</div>
                    <div class="text-sm opacity-90">${message}</div>
                </div>
                ${dismissButton}
            </div>
        `;
        
        // Add dismiss functionality
        if (dismissible) {
            const dismissBtn = toast.querySelector('.toast-dismiss');
            if (dismissBtn) {
                dismissBtn.addEventListener('click', () => this.removeNotification(toast));
            }
        }
        
        return toast;
    },
    
    /**
     * Positions notification based on preference
     */
    positionNotification(toast, position) {
        const positions = {
            'top-left': 'fixed top-4 left-4 z-50',
            'top-right': 'fixed top-4 right-4 z-50',
            'top-center': 'fixed top-4 left-1/2 transform -translate-x-1/2 z-50',
            'bottom-left': 'fixed bottom-4 left-4 z-50',
            'bottom-right': 'fixed bottom-4 right-4 z-50',
            'bottom-center': 'fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50'
        };
        
        toast.className += ` ${positions[position] || positions['top-right']}`;
    },
    
    /**
     * Removes notification with animation
     */
    removeNotification(toast) {
        if (!toast || !toast.parentNode) return;
        
        toast.classList.remove('enter-active');
        toast.classList.add('exit-active');
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 300);
    },
    
    /**
     * Gets notification icon based on type
     */
    getNotificationIcon(type) {
        const icons = {
            success: '<svg class="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>',
            error: '<svg class="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>',
            warning: '<svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path></svg>',
            info: '<svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
        };
        
        return icons[type] || icons.info;
    },
    
    /**
     * Shows update available banner
     */
    showUpdateBanner(onUpdate, onDismiss) {
        const existingBanner = document.getElementById('update-banner');
        if (existingBanner) existingBanner.remove();
        
        const banner = document.createElement('div');
        banner.id = 'update-banner';
        banner.className = 'fixed top-0 left-0 right-0 bg-blue-600 text-white text-center py-3 z-50 transform -translate-y-full transition-transform duration-300';
        
        banner.innerHTML = `
            <div class="flex items-center justify-center space-x-4">
                <span class="text-sm font-medium">A new version is available!</span>
                <button id="update-app-btn" class="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100 transition-colors">
                    Update Now
                </button>
                <button id="dismiss-update-btn" class="text-blue-200 hover:text-white transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Animate in
        setTimeout(() => banner.classList.remove('-translate-y-full'), 100);
        
        // Event listeners
        banner.querySelector('#update-app-btn').addEventListener('click', () => {
            if (onUpdate) onUpdate();
            this.removeUpdateBanner();
        });
        
        banner.querySelector('#dismiss-update-btn').addEventListener('click', () => {
            if (onDismiss) onDismiss();
            this.removeUpdateBanner();
        });
        
        return banner;
    },
    
    /**
     * Removes update banner
     */
    removeUpdateBanner() {
        const banner = document.getElementById('update-banner');
        if (banner) {
            banner.classList.add('-translate-y-full');
            setTimeout(() => banner.remove(), 300);
        }
    },
    
    /**
     * Creates loading indicator
     */
    createLoadingIndicator(options = {}) {
        const {
            message = 'Loading...',
            size = 'medium',
            overlay = false,
            className = 'pwa-loading'
        } = options;
        
        const sizeClasses = {
            small: 'w-4 h-4',
            medium: 'w-8 h-8',
            large: 'w-12 h-12'
        };
        
        const container = document.createElement('div');
        container.className = `${className} ${overlay ? 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50' : 'flex items-center justify-center'}`;
        
        container.innerHTML = `
            <div class="flex flex-col items-center space-y-2">
                <div class="animate-spin ${sizeClasses[size]} border-2 border-blue-600 border-t-transparent rounded-full"></div>
                ${message ? `<span class="text-sm text-gray-600">${message}</span>` : ''}
            </div>
        `;
        
        return container;
    },
    
    /**
     * Shows loading overlay
     */
    showLoading(message = 'Loading...') {
        const existing = document.getElementById('pwa-loading-overlay');
        if (existing) existing.remove();
        
        const loader = this.createLoadingIndicator({
            message,
            overlay: true,
            className: 'pwa-loading-overlay'
        });
        
        loader.id = 'pwa-loading-overlay';
        document.body.appendChild(loader);
        
        return {
            remove: () => {
                if (loader.parentNode) loader.remove();
            }
        };
    },
    
    /**
     * Hides loading overlay
     */
    hideLoading() {
        const loader = document.getElementById('pwa-loading-overlay');
        if (loader) loader.remove();
    },
    
    /**
     * Creates modal dialog
     */
    createModal(options = {}) {
        const {
            title = 'Modal',
            content = '',
            actions = [],
            dismissible = true,
            className = 'pwa-modal'
        } = options;
        
        const modal = document.createElement('div');
        modal.className = `${className} fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4`;
        
        const actionsHTML = actions.map(action => `
            <button class="modal-action btn ${action.className || 'btn-primary'}" data-action="${action.id}">
                ${action.text}
            </button>
        `).join('');
        
        const dismissButton = dismissible ? `
            <button class="modal-close absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
            </button>
        ` : '';
        
        modal.innerHTML = `
            <div class="modal-content bg-white rounded-lg shadow-xl max-w-md w-full max-h-full overflow-auto relative">
                ${dismissButton}
                <div class="modal-header p-6 pb-4">
                    <h2 class="text-xl font-semibold text-gray-900">${title}</h2>
                </div>
                <div class="modal-body p-6 pt-0">
                    ${content}
                </div>
                ${actions.length > 0 ? `
                    <div class="modal-footer p-6 pt-0 flex space-x-2 justify-end">
                        ${actionsHTML}
                    </div>
                ` : ''}
            </div>
        `;
        
        // Event delegation for actions
        modal.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-action')) {
                const actionId = e.target.dataset.action;
                const action = actions.find(a => a.id === actionId);
                if (action && action.handler) {
                    action.handler();
                }
            }
            
            if (dismissible && (e.target.classList.contains('modal-close') || e.target === modal)) {
                this.removeModal(modal);
            }
        });
        
        return modal;
    },
    
    /**
     * Shows modal dialog
     */
    showModal(options) {
        const modal = this.createModal(options);
        document.body.appendChild(modal);
        
        // Animate in
        setTimeout(() => modal.classList.add('modal-enter-active'), 100);
        
        return {
            element: modal,
            remove: () => this.removeModal(modal)
        };
    },
    
    /**
     * Removes modal dialog
     */
    removeModal(modal) {
        if (!modal || !modal.parentNode) return;
        
        modal.classList.remove('modal-enter-active');
        modal.classList.add('modal-exit-active');
        
        setTimeout(() => {
            if (modal.parentNode) {
                modal.remove();
            }
        }, 300);
    },
    
    /**
     * Creates progress bar
     */
    createProgressBar(options = {}) {
        const {
            value = 0,
            max = 100,
            label = '',
            showPercent = true,
            className = 'pwa-progress'
        } = options;
        
        const percent = Math.round((value / max) * 100);
        
        const progress = document.createElement('div');
        progress.className = `${className} w-full`;
        
        progress.innerHTML = `
            <div class="flex justify-between items-center mb-1">
                <span class="text-sm font-medium text-gray-700">${label}</span>
                ${showPercent ? `<span class="text-sm text-gray-500">${percent}%</span>` : ''}
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-blue-600 h-2 rounded-full transition-all duration-300" style="width: ${percent}%"></div>
            </div>
        `;
        
        return {
            element: progress,
            update: (newValue) => {
                const newPercent = Math.round((newValue / max) * 100);
                const bar = progress.querySelector('.bg-blue-600');
                const percentText = progress.querySelector('.text-gray-500');
                
                if (bar) bar.style.width = `${newPercent}%`;
                if (percentText && showPercent) percentText.textContent = `${newPercent}%`;
            }
        };
    },
    
    /**
     * Shows confirmation dialog
     */
    showConfirmation(message, title = 'Confirm', options = {}) {
        const {
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            type = 'primary'
        } = options;
        
        return new Promise((resolve) => {
            const modal = this.showModal({
                title,
                content: `<p class="text-gray-700">${message}</p>`,
                actions: [
                    {
                        id: 'cancel',
                        text: cancelText,
                        className: 'btn-ghost',
                        handler: () => {
                            modal.remove();
                            resolve(false);
                        }
                    },
                    {
                        id: 'confirm',
                        text: confirmText,
                        className: `btn-${type}`,
                        handler: () => {
                            modal.remove();
                            resolve(true);
                        }
                    }
                ]
            });
        });
    },
    
    /**
     * Shows alert dialog
     */
    showAlert(message, title = 'Alert', type = 'info') {
        return new Promise((resolve) => {
            const modal = this.showModal({
                title,
                content: `<p class="text-gray-700">${message}</p>`,
                actions: [
                    {
                        id: 'ok',
                        text: 'OK',
                        className: `btn-${type}`,
                        handler: () => {
                            modal.remove();
                            resolve();
                        }
                    }
                ]
            });
        });
    },
    
    /**
     * Manages notification queue
     */
    createNotificationQueue(maxVisible = 3) {
        const queue = [];
        let visibleCount = 0;
        
        return {
            add: (title, message, type, options = {}) => {
                const notification = { title, message, type, options };
                
                if (visibleCount < maxVisible) {
                    this.showNotificationFromQueue(notification);
                    visibleCount++;
                } else {
                    queue.push(notification);
                }
            },
            
            processQueue: () => {
                if (queue.length > 0 && visibleCount < maxVisible) {
                    const notification = queue.shift();
                    this.showNotificationFromQueue(notification);
                    visibleCount++;
                }
            },
            
            clear: () => {
                queue.length = 0;
                visibleCount = 0;
            },
            
            getQueueLength: () => queue.length
        };
    },
    
    /**
     * Shows notification from queue
     */
    showNotificationFromQueue(notification) {
        const toast = this.showNotification(
            notification.title,
            notification.message,
            notification.type,
            notification.options
        );
        
        // Track when notification is removed to process queue
        const originalRemove = toast.remove;
        toast.remove = () => {
            originalRemove();
            // Process next in queue after a short delay
            setTimeout(() => {
                if (this.notificationQueue) {
                    this.notificationQueue.processQueue();
                }
            }, 300);
        };
    },
    
    /**
     * Creates responsive design utilities
     */
    getResponsiveConfig() {
        const width = window.innerWidth;
        
        return {
            isMobile: width < 768,
            isTablet: width >= 768 && width < 1024,
            isDesktop: width >= 1024,
            notificationPosition: width < 768 ? 'bottom-center' : 'top-right',
            modalSize: width < 640 ? 'full' : 'medium',
            maxNotifications: width < 768 ? 2 : 3
        };
    },
    
    /**
     * Applies responsive styles
     */
    applyResponsiveStyles() {
        const config = this.getResponsiveConfig();
        const root = document.documentElement;
        
        root.style.setProperty('--notification-position', config.notificationPosition);
        root.style.setProperty('--modal-size', config.modalSize);
        root.style.setProperty('--max-notifications', config.maxNotifications);
        
        document.body.classList.toggle('mobile-layout', config.isMobile);
        document.body.classList.toggle('tablet-layout', config.isTablet);
        document.body.classList.toggle('desktop-layout', config.isDesktop);
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { pwaUI };
} else if (typeof window !== 'undefined') {
    window.pwaUI = pwaUI;
}
