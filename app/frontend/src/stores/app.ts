import { defineStore } from 'pinia';

import type { NotificationEntry, NotificationType, UserPreferences } from '@/types';

interface AppState {
  notifications: NotificationEntry[];
  preferences: UserPreferences;
  toastVisible: boolean;
  toastMessage: string;
  toastType: NotificationType;
  toastDuration: number;
  toastTimer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  autoSave: true,
  notifications: true,
  theme: 'light',
};

const DEFAULT_NOTIFICATION_DURATION = 5000;
const DEFAULT_TOAST_DURATION = 3000;

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    notifications: [],
    preferences: { ...DEFAULT_PREFERENCES },
    toastVisible: false,
    toastMessage: '',
    toastType: 'info',
    toastDuration: DEFAULT_TOAST_DURATION,
    toastTimer: null,
  }),

  getters: {
  },

  actions: {
    addNotification(
      message: string,
      type: NotificationType = 'info',
      duration: number = DEFAULT_NOTIFICATION_DURATION,
    ): number {
      if (!this.preferences.notifications) {
        return -1;
      }

      const id = Date.now();
      const entry: NotificationEntry = {
        id,
        message,
        type,
        timestamp: new Date().toISOString(),
      };
      this.notifications.push(entry);

      if (duration > 0) {
        setTimeout(() => {
          this.removeNotification(id);
        }, duration);
      }

      return id;
    },

    removeNotification(id: number): void {
      this.notifications = this.notifications.filter((notification) => notification.id !== id);
    },

    clearNotifications(): void {
      this.notifications = [];
    },

    setPreferences(preferences: Partial<UserPreferences>): void {
      this.preferences = { ...this.preferences, ...preferences };
    },

    showToast(
      message: string,
      type: NotificationType = 'info',
      duration: number = DEFAULT_TOAST_DURATION,
    ): void {
      this.clearToastTimer();

      this.toastMessage = message;
      this.toastType = type;
      this.toastDuration = duration;
      this.toastVisible = true;

      if (duration > 0) {
        this.toastTimer = setTimeout(() => {
          this.hideToast();
        }, duration);
      }
    },

    hideToast(): void {
      this.toastVisible = false;
      this.toastMessage = '';
      this.toastDuration = DEFAULT_TOAST_DURATION;
      this.clearToastTimer();
    },

    clearToastTimer(): void {
      if (this.toastTimer) {
        clearTimeout(this.toastTimer);
        this.toastTimer = null;
      }
    },
  },
});

export type AppStore = ReturnType<typeof useAppStore>;
