import { defineStore } from 'pinia';

import type { NotificationType } from '@/types';

interface ToastState {
  isVisible: boolean;
  message: string;
  type: NotificationType;
  duration: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_DURATION = 3000;

export const useToastStore = defineStore('toast', {
  state: (): ToastState => ({
    isVisible: false,
    message: '',
    type: 'info',
    duration: DEFAULT_DURATION,
    timer: null,
  }),

  actions: {
    show(message: string, type: NotificationType = 'info', duration = DEFAULT_DURATION): void {
      this.clearTimer();

      this.message = message;
      this.type = type;
      this.duration = duration;
      this.isVisible = true;

      if (duration > 0) {
        this.timer = setTimeout(() => {
          this.hide();
        }, duration);
      }
    },

    showSuccess(message: string, duration?: number): void {
      this.show(message, 'success', duration ?? DEFAULT_DURATION);
    },

    showError(message: string, duration?: number): void {
      this.show(message, 'error', duration ?? DEFAULT_DURATION);
    },

    showWarning(message: string, duration?: number): void {
      this.show(message, 'warning', duration ?? DEFAULT_DURATION);
    },

    showInfo(message: string, duration?: number): void {
      this.show(message, 'info', duration ?? DEFAULT_DURATION);
    },

    hide(): void {
      this.isVisible = false;
      this.message = '';
      this.duration = DEFAULT_DURATION;
      this.clearTimer();
    },

    clearTimer(): void {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    },
  },
});

export type ToastStore = ReturnType<typeof useToastStore>;
