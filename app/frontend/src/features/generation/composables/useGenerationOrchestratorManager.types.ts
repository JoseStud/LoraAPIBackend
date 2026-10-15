import type { Ref } from 'vue';

import type { GenerationNotificationAdapter } from '../types/transport';
import type { GenerationQueueClient } from '../services/queueClient';
import type { GenerationWebSocketManager } from '../services/websocketManager';
import type { GenerationRequestPayload, GenerationStartResponse, SystemStatusState } from '@/types';
import type { DeepReadonly } from '@/utils/freezeDeep';
import type { GenerationJobView, GenerationResultView } from '../orchestrator/facade';

export interface GenerationOrchestratorAutoSyncOptions {
  historyLimit?: boolean;
  backendUrl?: boolean;
}

export interface GenerationOrchestratorAcquireOptions {
  notify: GenerationNotificationAdapter['notify'];
  debug?: GenerationNotificationAdapter['debug'];
  queueClient?: GenerationQueueClient;
  websocketManager?: GenerationWebSocketManager;
  autoSync?: boolean | GenerationOrchestratorAutoSyncOptions;
  historyVisibility?: Readonly<Ref<boolean>>;
}

export interface GenerationOrchestratorBinding {
  activeJobs: Ref<ReadonlyArray<GenerationJobView>>;
  sortedActiveJobs: Ref<ReadonlyArray<GenerationJobView>>;
  recentResults: Ref<ReadonlyArray<GenerationResultView>>;
  systemStatus: Ref<DeepReadonly<SystemStatusState>>;
  isConnected: Ref<boolean>;
  initialize: () => Promise<void>;
  cleanup: () => void;
  loadSystemStatusData: () => Promise<void>;
  loadActiveJobsData: () => Promise<void>;
  loadRecentResultsData: (notifySuccess?: boolean) => Promise<void>;
  startGeneration: (payload: GenerationRequestPayload) => Promise<GenerationStartResponse>;
  /** Cancels the job with this backend id. */
  cancelJob: (jobId: string) => Promise<void>;
  /** Drops a job from the local queue by UI or backend id; the backend is not told. */
  removeJob: (jobId: string) => void;
  clearCompletedJobs: () => void;
  clearQueue: () => Promise<void>;
  deleteResult: (resultId: string | number) => Promise<void>;
  refreshResults: (notifySuccess?: boolean) => Promise<void>;
  canCancelJob: (job: GenerationJobView) => boolean;
  setHistoryLimit: (limit: number) => void;
  handleBackendUrlChange: () => Promise<void>;
  release: () => void;
}

