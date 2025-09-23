import { storeToRefs } from 'pinia';

import { useAppStore } from '@/stores';

import type { NotificationType } from '@/types';

export function useNotifications() {
  const appStore = useAppStore();
  const { notifications } = storeToRefs(appStore);

  const addNotification = (message: string, type: NotificationType = 'info', duration?: number) =>
    appStore.addNotification(message, type, duration ?? 5000);

  const removeNotification = (id: number) => appStore.removeNotification(id);
  const clearAll = () => appStore.clearNotifications();

  const showSuccess = (message: string, duration?: number) => addNotification(message, 'success', duration);
  const showError = (message: string, duration?: number) => addNotification(message, 'error', duration ?? 8000);
  const showWarning = (message: string, duration?: number) => addNotification(message, 'warning', duration ?? 6000);
  const showInfo = (message: string, duration?: number) => addNotification(message, 'info', duration);

  return {
    notifications,
    addNotification,
    removeNotification,
    clearAll,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
}

export type UseNotificationsReturn = ReturnType<typeof useNotifications>;
