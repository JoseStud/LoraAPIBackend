import { defineStore } from 'pinia';

import type {
  GenerationJob,
  GenerationResult,
  NotificationEntry,
  NotificationType,
  SystemStatusState,
  UserPreferences,
} from '@/types';
import { normalizeJobStatus } from '@/utils/status';

interface AppState {
  systemStatus: SystemStatusState;
  activeJobs: GenerationJob[];
  recentResults: GenerationResult[];
  notifications: NotificationEntry[];
  preferences: UserPreferences;
}

const DEFAULT_SYSTEM_STATUS: SystemStatusState = {
  gpu_available: true,
  queue_length: 0,
  status: 'healthy',
  gpu_status: 'Available',
  memory_used: 0,
  memory_total: 8192,
};

const DEFAULT_PREFERENCES: UserPreferences = {
  autoSave: true,
  notifications: true,
  theme: 'light',
};

const MAX_RESULTS = 20;

const createJobId = (): string => `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    systemStatus: { ...DEFAULT_SYSTEM_STATUS },
    activeJobs: [],
    recentResults: [],
    notifications: [],
    preferences: { ...DEFAULT_PREFERENCES },
  }),

  getters: {
    activeJobCount: (state) => state.activeJobs.length,
    hasActiveJobs: (state) => state.activeJobs.length > 0,
  },

  actions: {
    resetSystemStatus(): void {
      this.systemStatus = { ...DEFAULT_SYSTEM_STATUS };
    },

    updateSystemStatus(status: Partial<SystemStatusState>): void {
      this.systemStatus = { ...this.systemStatus, ...status };
    },

    addJob(job: Partial<GenerationJob>): string {
      const id = String(job.id ?? job.jobId ?? createJobId());
      const newJob: GenerationJob = {
        id,
        status: normalizeJobStatus(typeof job.status === 'string' ? job.status : undefined),
        progress: job.progress ?? 0,
        startTime: job.startTime ?? new Date().toISOString(),
        ...job,
      };
      const existingIndex = this.activeJobs.findIndex((item) => item.id === id);
      if (existingIndex >= 0) {
        this.activeJobs.splice(existingIndex, 1, newJob);
      } else {
        this.activeJobs.push(newJob);
      }
      return id;
    },

    setActiveJobs(jobs: Partial<GenerationJob>[]): void {
      this.activeJobs = jobs.map((job) => {
        const id = String(job.id ?? job.jobId ?? createJobId());
        return {
          id,
          status: normalizeJobStatus(typeof job.status === 'string' ? job.status : undefined),
          progress: job.progress ?? 0,
          startTime: job.startTime ?? new Date().toISOString(),
          ...job,
        } as GenerationJob;
      });
    },

    updateJob(jobId: string, updates: Partial<GenerationJob>): void {
      const index = this.activeJobs.findIndex((job) => job.id === jobId);
      if (index >= 0) {
        this.activeJobs[index] = { ...this.activeJobs[index], ...updates };
      }
    },

    removeJob(jobId: string): void {
      this.activeJobs = this.activeJobs.filter((job) => job.id !== jobId);
    },

    clearCompletedJobs(): void {
      this.activeJobs = this.activeJobs.filter((job) => !['completed', 'failed'].includes(job.status));
    },

    addResult(result: GenerationResult): void {
      this.recentResults = [result, ...this.recentResults].slice(0, MAX_RESULTS);
    },

    setRecentResults(results: GenerationResult[]): void {
      this.recentResults = results.slice(0, MAX_RESULTS);
    },

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
