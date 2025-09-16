<template>
  <div class="fixed top-4 right-4 z-50 max-w-sm">
    <!-- Live region for screen readers -->
    <div 
      ref="liveRegion"
      aria-live="polite" 
      aria-atomic="true" 
      class="sr-only"
    ></div>
    
    <div class="space-y-2">
      <transition-group
        name="notification"
        tag="div"
      >
        <div 
          v-for="notification in notifications" 
          :key="notification.id"
          :class="getNotificationClasses(notification.type)"
          role="alert"
          :aria-label="`${notification.type} notification: ${notification.message}`"
        >
          <div class="flex items-center">
            <span 
              :aria-hidden="true"
              class="mr-2"
              v-text="getNotificationIcon(notification.type)"
            ></span>
            <span 
              class="flex-1"
              v-text="notification.message"
            ></span>
            <button 
              @click="dismissNotification(notification.id)"
              class="ml-2 text-lg leading-none hover:opacity-70 focus:opacity-70 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded"
              :aria-label="`Dismiss ${notification.type} notification`"
              type="button"
            >
              ×
            </button>
          </div>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script>
import { ref, computed, provide, inject } from 'vue';

// Notification store symbol for provide/inject
export const NOTIFICATION_STORE_KEY = Symbol('notificationStore');

// Create a simple store for notifications
function createNotificationStore() {
  const notifications = ref([]);
  
  const addNotification = (message, type = 'info', duration = 5000) => {
    const notification = {
      id: Date.now() + Math.random(), // Ensure uniqueness
      message,
      type,
      timestamp: new Date()
    };
    
    notifications.value.push(notification);
    
    // Auto-dismiss after specified duration
    if (duration > 0) {
      setTimeout(() => {
        removeNotification(notification.id);
      }, duration);
    }
    
    return notification.id;
  };
  
  const removeNotification = (id) => {
    const index = notifications.value.findIndex(n => n.id === id);
    if (index > -1) {
      notifications.value.splice(index, 1);
    }
  };
  
  const clearAll = () => {
    notifications.value.length = 0;
  };
  
  return {
    notifications: computed(() => notifications.value),
    addNotification,
    removeNotification,
    clearAll
  };
}

export default {
  name: 'Notifications',
  setup() {
    const liveRegion = ref(null);
    
    // Try to inject existing store, or create a new one
    let notificationStore;
    try {
      notificationStore = inject(NOTIFICATION_STORE_KEY, null);
    } catch {
      notificationStore = null;
    }
    
    if (!notificationStore) {
      notificationStore = createNotificationStore();
      provide(NOTIFICATION_STORE_KEY, notificationStore);
    }
    
    const { notifications, removeNotification, addNotification, clearAll } = notificationStore;
    
    const dismissNotification = (id) => {
      removeNotification(id);
    };
    
    const getNotificationIcon = (type) => {
      switch (type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'warning': return '⚠️';
        case 'info': return 'ℹ️';
        default: return '📝';
      }
    };
    
    const getNotificationClasses = (type) => {
      const base = 'notification-toast rounded-lg p-4 mb-2 shadow-lg border-l-4 flex items-center justify-between transition-all duration-200';
      
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
    };
    
    // Provide the store globally for other components to use
    provide(NOTIFICATION_STORE_KEY, notificationStore);
    
    // Also make it available globally for backward compatibility with Alpine
    if (typeof window !== 'undefined') {
      window.vueNotifications = notificationStore;
      
      // Bridge function to integrate with Alpine store
      const bridgeToAlpine = () => {
        if (window.Alpine && window.Alpine.store) {
          const alpineStore = window.Alpine.store('app');
          if (alpineStore) {
            // Sync Vue notifications to Alpine store
            const originalAddNotification = addNotification;
            const bridgedAddNotification = (message, type = 'info', duration = 5000) => {
              const id = originalAddNotification(message, type, duration);
              // Also add to Alpine store for compatibility
              alpineStore.addNotification(message, type);
              return id;
            };
            
            // Replace the exposed method with the bridged version
            notificationStore.addNotification = bridgedAddNotification;
            
            // Make it accessible via Alpine as well
            alpineStore.vueNotifications = notificationStore;
          }
        }
      };
      
      // Try to bridge immediately or wait for Alpine to load
      if (window.Alpine) {
        bridgeToAlpine();
      } else {
        window.addEventListener('alpine:init', bridgeToAlpine);
      }
    }
    
    return {
      liveRegion,
      notifications,
      dismissNotification,
      getNotificationIcon,
      getNotificationClasses,
      addNotification,
      removeNotification,
      clearAll
    };
  }
};
</script>

<style scoped>
/* Transition animations for notifications */
.notification-enter-active {
  transition: all 0.3s ease-out;
}

.notification-leave-active {
  transition: all 0.2s ease-in;
}

.notification-enter-from {
  opacity: 0;
  transform: translateX(100%);
}

.notification-leave-to {
  opacity: 0;
  transform: translateX(100%);
}

.notification-move {
  transition: transform 0.3s ease;
}

/* Screen reader only class */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>