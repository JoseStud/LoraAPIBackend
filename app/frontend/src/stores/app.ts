import { defineStore } from 'pinia';

import type { NotificationEntry, NotificationType, UserPreferences } from '@/types';

interface AppState {
  notifications: NotificationEntry[];
  preferences: UserPreferences;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  autoSave: true,
  notifications: true,
  theme: 'light',
};

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    notifications: [],
    preferences: { ...DEFAULT_PREFERENCES },
  }),

  getters: {
  },

  actions: {
    addNotification(message: string, type: NotificationType = 'info', duration = 5000): number {
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
  },
});

export type AppStore = ReturnType<typeof useAppStore>;
