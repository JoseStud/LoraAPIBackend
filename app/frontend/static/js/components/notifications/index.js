/**
 * Notifications Component
 * 
 * Displays global notifications/toasts.
 * Uses the global store for notification data.
 */

export function createNotificationsComponent() {
    return {
        isInitialized: false,
        
        init() {
            this.isInitialized = true;
        },
        
        // Dismiss a notification
        dismissNotification(id) {
            this.$store.app.removeNotification(id);
        },
        
        // Get notification icon
        getNotificationIcon(type) {
            switch (type) {
                case 'success': return '✅';
                case 'error': return '❌';
                case 'warning': return '⚠️';
                case 'info': return 'ℹ️';
                default: return '📝';
            }
        },
        
        // Get notification color classes
        getNotificationClasses(type) {
            const base = 'notification-toast rounded-lg p-4 mb-2 shadow-lg border-l-4 flex items-center justify-between';
            
            switch (type) {
                case 'success':
                    return `${base} bg-green-50 border-green-500 text-green-800`;
                case 'error':
                    return `${base} bg-red-50 border-red-500 text-red-800`;
                case 'warning':
                    return `${base} bg-yellow-50 border-yellow-500 text-yellow-800`;
                case 'info':
                    return `${base} bg-blue-50 border-blue-500 text-blue-800`;
                default:
                    return `${base} bg-gray-50 border-gray-500 text-gray-800`;
            }
        },
        
        // Format timestamp
        formatTime(timestamp) {
            return new Date(timestamp).toLocaleTimeString();
        },
        
        // Computed properties
        get notifications() {
            return this.$store.app.notifications;
        },
        
        get hasNotifications() {
            return this.notifications.length > 0;
        }
    };
}
