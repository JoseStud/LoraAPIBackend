import { storeToRefs } from 'pinia';

import { useAppStore } from '@/stores';

import type { NotificationType } from '@/types';

type NotificationDispatcher<ReturnType> = (
  message: string,
  type: NotificationType,
  duration?: number,
) => ReturnType;

const createTypeHelpers = <ReturnType>(
  dispatch: NotificationDispatcher<ReturnType>,
) => {
  const show = (
    message: string,
    type: NotificationType = 'info',
    duration?: number,
  ): ReturnType => dispatch(message, type, duration);

  return {
    show,
    showSuccess: (message: string, duration?: number): ReturnType =>
      dispatch(message, 'success', duration),
    showError: (message: string, duration?: number): ReturnType =>
      dispatch(message, 'error', duration),
    showWarning: (message: string, duration?: number): ReturnType =>
      dispatch(message, 'warning', duration),
    showInfo: (message: string, duration?: number): ReturnType =>
      dispatch(message, 'info', duration),
  } as const;
};

export function useNotifications() {
  const appStore = useAppStore();
  const { notifications, toastVisible, toastMessage, toastType, toastDuration } =
    storeToRefs(appStore);

  const dispatchStacked = (
    message: string,
    type: NotificationType,
    duration?: number,
  ): number => appStore.addNotification(message, type, duration);

  const dispatchToast = (
    message: string,
    type: NotificationType,
    duration?: number,
  ): void => {
    appStore.showToast(message, type, duration);
  };

  const stackedHelpers = createTypeHelpers(dispatchStacked);
  const toastHelpers = createTypeHelpers(dispatchToast);

  return {
    notifications,
    addNotification: stackedHelpers.show,
    notify: stackedHelpers.show,
    removeNotification: (id: number) => appStore.removeNotification(id),
    clearAll: () => appStore.clearNotifications(),
    showSuccess: stackedHelpers.showSuccess,
    showError: stackedHelpers.showError,
    showWarning: stackedHelpers.showWarning,
    showInfo: stackedHelpers.showInfo,
    toastVisible,
    toastMessage,
    toastType,
    toastDuration,
    showToast: toastHelpers.show,
    showToastSuccess: toastHelpers.showSuccess,
    showToastError: toastHelpers.showError,
    showToastWarning: toastHelpers.showWarning,
    showToastInfo: toastHelpers.showInfo,
    hideToast: () => appStore.hideToast(),
    clearToastTimer: () => appStore.clearToastTimer(),
  } as const;
}

export type UseNotificationsReturn = ReturnType<typeof useNotifications>;
