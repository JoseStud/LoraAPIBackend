/**
 * Shared application-level types used by Pinia stores and components.
 */

import type { GeneratedNormalizedJobStatus } from '@/constants/generated/jobStatuses';

export interface FrontendRuntimeSettings {
  backendUrl: string;
  backendApiKey?: string | null;
  [key: string]: unknown;
}

export interface SettingsState {
  settings: FrontendRuntimeSettings | null;
  isLoading: boolean;
  isLoaded: boolean;
  error: unknown | null;
}

export interface SystemStatusState {
  gpu_available: boolean;
  queue_length: number;
  status: string;
  gpu_status: string;
  memory_used: number;
  memory_total: number;
  active_workers?: number;
  backend?: string | null;
  queue_eta_seconds?: number | null;
  last_updated?: string | null;
  warnings?: string[];
  [key: string]: unknown;
}

export type NormalizedJobStatus = GeneratedNormalizedJobStatus;

export type JobStatus = NormalizedJobStatus;

export interface GenerationJob {
  id: string;
  jobId?: string;
  name?: string;
  prompt?: string;
  status: JobStatus;
  progress: number;
  message?: string;
  startTime: string;
  created_at?: string;
  current_step?: number;
  total_steps?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  seed?: number | null;
  params?: Record<string, unknown> & {
    width?: number;
    height?: number;
    steps?: number;
  };
  [key: string]: unknown;
}

export interface GenerationResult {
  id: string | number;
  job_id?: string;
  result_id?: string | number;
  prompt?: string;
  negative_prompt?: string | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  seed?: number | null;
  created_at?: string;
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
