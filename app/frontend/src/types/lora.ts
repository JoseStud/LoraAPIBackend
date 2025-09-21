/**
 * Type definitions mirroring backend/schemas/adapters.py.
 */

/** Request payload for creating a new adapter. */
export interface AdapterCreate {
  name: string;
  version?: string | null;
  canonical_version_name?: string | null;
  description?: string | null;
  author_username?: string | null;
  visibility?: string | null;
  published_at?: string | null;
  tags?: string[] | null;
  trained_words?: string[] | null;
  triggers?: string[] | null;
  file_path: string;
  weight?: number | null;
  active?: boolean | null;
  ordinal?: number | null;
  primary_file_name?: string | null;
  primary_file_size_kb?: number | null;
  primary_file_sha256?: string | null;
  primary_file_download_url?: string | null;
  primary_file_local_path?: string | null;
  supports_generation?: boolean | null;
  sd_version?: string | null;
  nsfw_level?: number | null;
  activation_text?: string | null;
  /**
   * Backend stores arbitrary ingestion metrics here.
   * TODO: replace with a structured shape when the API contract stabilises.
   */
  stats?: Record<string, unknown> | null;
  /**
   * Backend stores adapter-specific metadata here.
   * TODO: document concrete keys once the backend schema stops evolving.
   */
  extra?: Record<string, unknown> | null;
  json_file_path?: string | null;
  json_file_mtime?: string | null;
  json_file_size?: number | null;
  last_ingested_at?: string | null;
}

/** Public adapter representation returned by the API. */
export interface AdapterRead {
  id: string;
  name: string;
  version?: string | null;
  canonical_version_name?: string | null;
  description?: string | null;
  author_username?: string | null;
  visibility: string;
  published_at?: string | null;
  tags: string[];
  trained_words: string[];
  triggers: string[];
  file_path: string;
  weight: number;
  active: boolean;
  ordinal?: number | null;
  archetype?: string | null;
  archetype_confidence?: number | null;
  primary_file_name?: string | null;
  primary_file_size_kb?: number | null;
  primary_file_sha256?: string | null;
  primary_file_download_url?: string | null;
  primary_file_local_path?: string | null;
  supports_generation: boolean;
  sd_version?: string | null;
  nsfw_level: number;
  activation_text?: string | null;
  /**
   * Adapter usage statistics emitted by the backend.
   * TODO: keep this in sync with future stats schema updates.
   */
  stats?: Record<string, unknown> | null;
  /**
   * Additional metadata supplied by the backend.
   * TODO: replace with specific keys when the API solidifies.
   */
  extra?: Record<string, unknown> | null;
  json_file_path?: string | null;
  json_file_mtime?: string | null;
  json_file_size?: number | null;
  last_ingested_at?: string | null;
  last_updated?: string | null;
  created_at: string;
  updated_at: string;
}

/** Wrapper used by endpoints that return a single adapter. */
export interface AdapterWrapper {
  adapter: AdapterRead;
}

/** Paginated list response for adapter queries. */
export interface AdapterListResponse {
  items: AdapterRead[];
  total: number;
  filtered: number;
  page: number;
  pages: number;
  per_page: number;
}

export interface AdapterListQuery {
  page?: number;
  perPage?: number;
  search?: string;
  active?: boolean;
  tags?: readonly string[];
  sort?: string;
}

export type LoraGallerySortOption =
  | 'name_asc'
  | 'name_desc'
  | 'created_at_desc'
  | 'created_at_asc'
  | 'last_updated_desc';

export interface LoraGalleryFilters {
  search?: string;
  activeOnly: boolean;
  tags: string[];
  sort: LoraGallerySortOption;
}

export interface LoraGallerySelectionState {
  viewMode: 'grid' | 'list';
  bulkMode: boolean;
  selectedIds: string[];
}

export type LoraBulkAction = 'activate' | 'deactivate' | 'delete';

export interface LoraBulkActionRequest {
  action: LoraBulkAction;
  lora_ids: string[];
}

export interface LoraTagListResponse {
  tags: string[];
  [key: string]: unknown;
}

export interface LoraGalleryState {
  filters: LoraGalleryFilters;
  availableTags: string[];
  showAllTags: boolean;
  selection: LoraGallerySelectionState;
}
