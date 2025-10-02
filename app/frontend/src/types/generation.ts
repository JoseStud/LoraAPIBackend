/**
 * Type definitions mirroring backend/schemas/generation.py.
 */

import type { GeneratedNormalizedJobStatus } from '@/constants/generated/jobStatuses';

import type { BackendSchemas } from './generated';
import type { JsonObject } from './json';
import type { SystemStatusPayload } from './system';

type Schemas = BackendSchemas;
type GenerationJobStatusSchema = Schemas['GenerationJobStatus'];
type GenerationResultSummarySchema = Schemas['GenerationResultSummary'];

export type NormalizedJobStatus = GeneratedNormalizedJobStatus;

export interface GenerationFormState {
  prompt: string;
  negative_prompt: string;
  steps: number;
  sampler_name: string;
  cfg_scale: number;
  width: number;
  height: number;
  seed: number;
  batch_size: number;
  batch_count: number;
  denoising_strength?: number | null;
}

export type SDNextGenerationParams = Schemas['SDNextGenerationParams'];

export type GenerationMode = Schemas['GenerationMode'];

export type GenerationResultFormat = Schemas['GenerationResultFormat'];

export type ComposeDeliverySDNext = Schemas['ComposeDeliverySDNext'];

export type SDNextDeliveryParams = Schemas['ComposeDeliverySDNext'];

type SDNextGenerationResultSchema = Schemas['SDNextGenerationResult'];

export type SDNextGenerationResult = Omit<SDNextGenerationResultSchema, 'status' | 'generation_info'> & {
  /** Normalized status reported by the backend. */
  status: NormalizedJobStatus | SDNextGenerationResultSchema['status'];
  /** Base64 strings, URLs, or filesystem paths depending on delivery parameters. */
  images?: string[] | null;
  /** 0.0–1.0 progress indicator. */
  progress?: number | null;
  generation_info?: JsonObject | null;
};

export interface GenerationLoraReference {
  id: string;
  name?: string | null;
  version?: string | null;
  weight?: number | null;
  adapter_id?: string | null;
  extra?: JsonObject | null;
}

export type GenerationJobStatus = Omit<
  GenerationJobStatusSchema,
  'status' | 'params' | 'result' | 'jobId'
> & {
  name?: string | null;
  status: NormalizedJobStatus;
  params?: JsonObject | null;
  result?: JsonObject | null;
  jobId?: string | number;
  current_step?: number | null;
  total_steps?: number | null;
  steps?: number | null;
  width?: number | null;
  height?: number | null;
  cfg_scale?: number | null;
  seed?: number | null;
};

export type GenerationJob = GenerationJobStatus & {
  /** Stable identifier used by the UI layer and tests. */
  uiId: string;
  /** Backend identifier expected by transport commands. */
  backendId: string;
};

export type GenerationHistoryResult = Omit<
  GenerationResultSummarySchema,
  'id' | 'job_id' | 'status' | 'generation_info' | 'is_favorite' | 'rating' | 'rating_updated_at' | 'favorite_updated_at'
> & {
  id: GenerationResultSummarySchema['id'] | number;
  job_id?: GenerationResultSummarySchema['job_id'];
  status?: NormalizedJobStatus | GenerationResultSummarySchema['status'] | null;
  generation_info?: JsonObject | null;
  metadata?: JsonObject | null;
  loras?: GenerationLoraReference[] | null;
  updated_at?: string | null;
  sampler_name?: string | null;
  sampler?: string | null;
  model?: string | null;
  model_name?: string | null;
  clip_skip?: number | null;
  rating?: number | null;
  is_favorite?: boolean;
  rating_updated_at?: string | null;
  favorite_updated_at?: string | null;
};

export type GenerationHistoryEntry = GenerationHistoryResult;

export type GenerationResult = GenerationHistoryResult & {
  result_id?: string | number;
};

export interface GenerationHistoryPageInfo {
  page?: number;
  page_size?: number;
  total?: number;
  pages?: number;
  has_more?: boolean;
  next_page?: number | null;
  previous_page?: number | null;
}

export interface GenerationHistoryStats {
  total_results: number;
  avg_rating: number;
  total_favorites: number;
  total_size: number;
}

export interface GenerationHistoryResponse extends GenerationHistoryPageInfo {
  results: GenerationHistoryResult[];
  stats?: GenerationHistoryStats;
}

export type GenerationHistoryPayload = GenerationHistoryResult[] | GenerationHistoryResponse;

export interface GenerationHistoryListResponse extends GenerationHistoryResponse {}

export type GenerationHistoryListPayload = GenerationHistoryResult[] | GenerationHistoryListResponse;

export interface GenerationHistoryQuery {
  page?: number;
  page_size?: number;
  search?: string;
  sort?: string;
  min_rating?: number;
  width?: number;
  height?: number;
  start_date?: string;
  end_date?: string;
  date_filter?: string;
}

export interface GenerationRatingUpdate {
  rating: number;
}

export interface GenerationFavoriteUpdate {
  is_favorite: boolean;
}

export interface GenerationBulkFavoriteRequest extends GenerationFavoriteUpdate {
  ids: readonly (string | number)[];
}

export type GenerationBulkDeleteRequest = Schemas['GenerationBulkDeleteRequest'];

export type GenerationExportRequest = Omit<
  Schemas['GenerationExportRequest'],
  'include_metadata'
> & {
  include_metadata?: boolean;
};

export interface GenerationDownloadMetadata {
  blob: Blob;
  filename: string;
  contentType?: string | null;
  size: number;
}

export type GenerationRequestPayload = SDNextGenerationParams;

export type GenerationStartResponse = SDNextGenerationResult;

export type GenerationCancelResponse = Schemas['GenerationCancelResponse'];

export interface ProgressUpdate {
  job_id: string;
  progress: number;
  status: NormalizedJobStatus;
  current_step?: number | null;
  total_steps?: number | null;
  eta_seconds?: number | null;
  /** Base64 encoded preview image when available. */
  preview_image?: string | null;
  error_message?: string | null;
}

export interface GenerationStarted {
  job_id: string;
  params: SDNextGenerationParams;
  estimated_duration?: number | null;
}

export interface GenerationComplete {
  job_id: string;
  /** "completed" or "failed". */
  status: Extract<NormalizedJobStatus, 'completed' | 'failed'>;
  images?: string[] | null;
  error_message?: string | null;
  total_duration?: number | null;
  generation_info?: JsonObject | null;
}

export interface GenerationProgressMessage extends ProgressUpdate {
  type: 'generation_progress';
}

export interface GenerationCompleteMessage extends GenerationComplete {
  type: 'generation_complete';
  result_id?: string | number;
  prompt?: string;
  image_url?: string | null;
  width?: number;
  height?: number;
  steps?: number;
  cfg_scale?: number;
  seed?: number | null;
  negative_prompt?: string | null;
  created_at?: string;
}

export interface GenerationErrorMessage {
  type: 'generation_error';
  job_id: string;
  error: string;
  status?: string;
  [key: string]: unknown;
}

export interface GenerationQueueUpdateMessage {
  type: 'queue_update';
  jobs?: Partial<GenerationJob>[];
  [key: string]: unknown;
}

export interface GenerationSystemStatusMessage extends SystemStatusPayload {
  type: 'system_status';
}

export interface GenerationStartedMessage extends GenerationStarted {
  type: 'generation_started';
}

export type WebSocketMessage =
  | GenerationProgressMessage
  | GenerationCompleteMessage
  | GenerationErrorMessage
  | GenerationQueueUpdateMessage
  | GenerationSystemStatusMessage
  | GenerationStartedMessage
  | { type?: string; [key: string]: unknown };
