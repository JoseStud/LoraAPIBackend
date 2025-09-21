/**
 * Shared application-level types used by Pinia stores and components.
 */

export interface SystemStatusState {
  gpu_available: boolean;
  queue_length: number;
  status: string;
  gpu_status: string;
  memory_used: number;
  memory_total: number;
}

export type JobStatus =
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'queued'
  | 'starting'
  | 'processing'
  | string;

export interface GenerationJob {
  id: string;
  jobId?: string;
  name?: string;
  prompt?: string;
  status: JobStatus;
  progress: number;
  message?: string;
  startTime: string;
  params?: Record<string, unknown> & {
    width?: number;
    height?: number;
    steps?: number;
  };
  [key: string]: unknown;
}

export interface GenerationResult {
  id: string | number;
  [key: string]: unknown;
}

export type NotificationType = 'info' | 'success' | 'error' | 'warning';

export interface NotificationEntry {
  id: number;
  message: string;
  type: NotificationType;
  timestamp: string;
}

export interface UserPreferences {
  autoSave: boolean;
  notifications: boolean;
  theme: string;
  [key: string]: unknown;
}

export interface FrontendRuntimeSettings {
  backendUrl: string;
  backendApiKey?: string | null;
  [key: string]: unknown;
}
