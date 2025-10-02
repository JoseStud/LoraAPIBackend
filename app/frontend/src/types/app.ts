/**
 * Shared application-level types used by Pinia stores and components.
 */

import type { NormalizedJobStatus } from './generation';
import type {
  RecommendationRuntimeStatus,
  SystemImporterStatus,
  SystemQueueStatistics,
  SystemThresholds,
  SystemSdNextStatus,
} from './system';


export interface GenerationPollingSettings {
  queueMs?: number | string | null;
  websocketRetryMs?: number | string | null;
  systemStatusMs?: number | string | null;
  [key: string]: unknown;
}

export interface FrontendRuntimeSettings {
  backendUrl: string;
  backendApiKey?: string | null;
  generationPolling?: GenerationPollingSettings | null;
  [key: string]: unknown;
}

export interface SettingsState {
  settings: FrontendRuntimeSettings | null;
  isLoading: boolean;
  isLoaded: boolean;
  error: unknown | null;
}

export interface SystemStatusState {
  gpu_available: boolean | null;
  queue_length: number | null;
  status: string | null;
  gpu_status: string | null;
  memory_used: number | null;
  memory_total: number | null;
  active_workers?: number | null;
  backend?: string | null;
  queue_eta_seconds?: number | null;
  last_updated?: string | null;
  warnings?: readonly string[] | null;
  sdnext?: SystemSdNextStatus | null;
  importer?: SystemImporterStatus | null;
  recommendations?: RecommendationRuntimeStatus | null;
  queue?: SystemQueueStatistics | null;
  thresholds?: SystemThresholds | null;
  [key: string]: unknown;
}

export type JobStatus = NormalizedJobStatus;

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
