/**
 * Type definitions mirroring backend/schemas/generation.py.
 */

export interface SDNextGenerationParams {
  prompt: string;
  negative_prompt?: string | null;
  steps: number;
  sampler_name: string;
  cfg_scale: number;
  width: number;
  height: number;
  seed: number;
  batch_size: number;
  n_iter: number;
  denoising_strength?: number | null;
}

export interface ComposeDeliverySDNext {
  generation_params: SDNextGenerationParams;
  mode?: string;
  save_images?: boolean;
  return_format?: string;
}

export interface SDNextDeliveryParams {
  generation_params: SDNextGenerationParams;
  /** One of "immediate" or "deferred". */
  mode?: string;
  save_images?: boolean;
  /** One of "base64", "url", or "file_path". */
  return_format?: string;
}

export interface SDNextGenerationResult {
  job_id: string;
  /** "pending", "running", "completed", or "failed". */
  status: string;
  /** Base64 strings, URLs, or filesystem paths depending on delivery parameters. */
  images?: string[] | null;
  /** 0.0–1.0 progress indicator. */
  progress?: number | null;
  error_message?: string | null;
  /**
   * Backend emits engine-specific metadata here.
   * TODO: update once generation_info payload is formalised.
   */
  generation_info?: Record<string, unknown> | null;
}

export interface GenerationLoraReference {
  id: string;
  name?: string | null;
  version?: string | null;
  weight?: number | null;
  adapter_id?: string | null;
  /** Additional metadata attached to the LoRA reference. */
  extra?: Record<string, unknown> | null;
}

export interface GenerationHistoryEntry {
  id: string | number;
  job_id?: string | null;
  prompt: string;
  negative_prompt?: string | null;
  image_url: string;
  thumbnail_url?: string | null;
  created_at: string;
  updated_at?: string | null;
  width: number;
  height: number;
  steps: number;
  cfg_scale: number;
  seed?: number | null;
  sampler_name?: string | null;
  model_name?: string | null;
  status?: string | null;
  rating?: number | null;
  is_favorite?: boolean;
  loras?: GenerationLoraReference[] | null;
  metadata?: Record<string, unknown> | null;
  /**
   * Backend may return additional engine-specific fields.
   * Consumers should narrow this record when stricter typing becomes available.
   */
  [key: string]: unknown;
}

export interface GenerationHistoryPageInfo {
  page?: number;
  page_size?: number;
  total?: number;
  pages?: number;
  has_more?: boolean;
  next_page?: number | null;
  previous_page?: number | null;
}

export interface GenerationHistoryResponse extends GenerationHistoryPageInfo {
  results: GenerationHistoryEntry[];
}

export type GenerationHistoryPayload = GenerationHistoryEntry[] | GenerationHistoryResponse;

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
  [key: string]: unknown;
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

export interface GenerationBulkDeleteRequest {
  ids: readonly (string | number)[];
}

export interface GenerationExportRequest {
  ids: readonly (string | number)[];
  include_metadata?: boolean;
}

export interface GenerationDownloadMetadata {
  blob: Blob;
  filename: string;
  contentType?: string | null;
  size: number;
}

export interface ProgressUpdate {
  job_id: string;
  progress: number;
  status: string;
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
  status: string;
  images?: string[] | null;
  error_message?: string | null;
  total_duration?: number | null;
  /**
   * Backend emits engine-specific metadata here.
   * TODO: align once generation_info gains a stable contract.
   */
  generation_info?: Record<string, unknown> | null;
}
