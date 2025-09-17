/**
 * Composable for managing notifications in Vue components
 */
import { inject } from 'vue';
import { NOTIFICATION_STORE_KEY } from '../Notifications.vue';

export function useNotifications() {
  const notificationStore = inject(NOTIFICATION_STORE_KEY, null);
  
  if (!notificationStore) {
    console.warn('Notification store not found. Make sure the Notifications component is mounted.');
    
    // Return a fallback implementation
    return {
      notifications: [],
      addNotification: (message, type = 'info') => {
        console.warn(`Notification (${type}): ${message}`);
      },
      removeNotification: () => {},
      clearAll: () => {}
    };
  }
  
  const { notifications, addNotification, removeNotification, clearAll } = notificationStore;
  
  // Convenience methods for different notification types
  const showSuccess = (message, duration = 5000) => {
    return addNotification(message, 'success', duration);
  };
  
  const showError = (message, duration = 8000) => {
    return addNotification(message, 'error', duration);
  };
  
  const showWarning = (message, duration = 6000) => {
    return addNotification(message, 'warning', duration);
  };
  
  const showInfo = (message, duration = 5000) => {
    return addNotification(message, 'info', duration);
  };
  
  return {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
}