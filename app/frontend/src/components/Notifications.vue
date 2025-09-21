<template>
  <div class="fixed top-4 right-4 z-50 max-w-sm">
    <div
      ref="liveRegion"
      aria-live="polite"
      aria-atomic="true"
      class="sr-only"
    />

    <div class="space-y-2">
      <transition-group name="notification" tag="div">
        <div
          v-for="notification in notifications"
          :key="notification.id"
          :class="getNotificationClasses(notification.type)"
          role="alert"
          :aria-label="`${notification.type} notification: ${notification.message}`"
        >
          <div class="flex items-center">
            <span
              aria-hidden="true"
              class="mr-2"
              v-text="getNotificationIcon(notification.type)"
            />
            <span class="flex-1" v-text="notification.message" />
            <button
              type="button"
              class="ml-2 text-lg leading-none hover:opacity-70 focus:opacity-70 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 rounded"
              :aria-label="`Dismiss ${notification.type} notification`"
              @click="dismissNotification(notification.id)"
            >
              ×
            </button>
          </div>
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { storeToRefs } from 'pinia';

import { useAppStore } from '@/stores/app';

import type { NotificationType } from '@/types';

const appStore = useAppStore();
const { notifications } = storeToRefs(appStore);

const liveRegion = ref<HTMLElement | null>(null);

const dismissNotification = (id: number) => {
  appStore.removeNotification(id);
};

const getNotificationIcon = (type: NotificationType) => {
  switch (type) {
    case 'success':
      return '✅';
    case 'error':
      return '❌';
    case 'warning':
      return '⚠️';
    case 'info':
    default:
      return 'ℹ️';
  }
};

const getNotificationClasses = (type: NotificationType) => {
  const base = 'notification-toast rounded-lg p-4 mb-2 shadow-lg border-l-4 flex items-center justify-between transition-all duration-200';

  switch (type) {
    case 'success':
      return `${base} bg-green-50 border-green-500 text-green-800`;
    case 'error':
      return `${base} bg-red-50 border-red-500 text-red-800`;
    case 'warning':
      return `${base} bg-yellow-50 border-yellow-500 text-yellow-800`;
    case 'info':
    default:
      return `${base} bg-blue-50 border-blue-500 text-blue-800`;
  }
};

watch(
  notifications,
  (next, prev) => {
    if (!liveRegion.value) return;
    if (next.length > prev.length) {
      const added = next[next.length - 1];
      liveRegion.value.textContent = `${added.type} notification: ${added.message}`;
    }
  },
  { deep: true }
);
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
