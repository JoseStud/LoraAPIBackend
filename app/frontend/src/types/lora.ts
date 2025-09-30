/**
 * Type definitions mirroring backend/schemas/adapters.py.
 */

import type { BackendSchemas } from './generated';

type Schemas = BackendSchemas;

export type AdapterStatsMetric =
  | 'downloadCount'
  | 'favoriteCount'
  | 'commentCount'
  | 'thumbsUpCount'
  | 'rating'
  | 'ratingCount'
  | 'usage_count'
  | 'generations'
  | 'activations'
  | 'success_rate'
  | 'avg_time'
  | 'avg_generation_time';

/**
 * Engagement and usage metrics tracked for adapters.
 *
 * Values originate from importer metadata (e.g. Civitai statistics) as well as
 * runtime analytics aggregated by the backend. The metric keys are
 * intentionally enumerated to keep the frontend aligned with backend
 * contracts.
 */
export type AdapterStats = Partial<Record<AdapterStatsMetric, number>>;

/**
 * Rich metadata persisted alongside adapters.
 *
 * The importer populates these fields using the source manifest while the
 * backend may attach additional presentation hints. Unknown fields are stored
 * inside `unmapped` using JSON-compatible values.
 */
type AdapterCreateSchema = Schemas['AdapterCreate'];
type AdapterReadSchema = Schemas['AdapterRead'];

/** Request payload for creating a new adapter. */
export type AdapterCreate = Omit<AdapterCreateSchema, 'stats' | 'extra'> & {
  /** Structured metrics sourced from importer metadata or analytics. */
  stats?: AdapterStats | null;
  /** Additional metadata collected during ingestion. */
  extra?: Record<string, unknown> | null;
};

/** Public adapter representation returned by the API. */
export type AdapterRead = Omit<AdapterReadSchema, 'stats' | 'extra'> & {
  /** Adapter usage statistics emitted by the backend. */
  stats?: AdapterStats | null;
  /** Additional metadata supplied by the backend. */
  extra?: Record<string, unknown> | null;
  last_updated?: string | null;
};

/** Wrapper used by endpoints that return a single adapter. */
export type AdapterWrapper = Schemas['AdapterWrapper'];

/** Paginated list response for adapter queries. */
export type AdapterListResponse = Schemas['AdapterListResponse'];

export type LoraListItem = Omit<AdapterRead, 'weight' | 'tags'> & {
  tags?: AdapterRead['tags'];
  /** Optional preview image resolved on the client side. */
  preview_image?: string | null;
  /** Weight slider value, defaults to adapter weight when missing. */
  weight?: AdapterRead['weight'];
  /** Quality score surfaced by the UI layer. */
  quality_score?: number | null;
  /** Optional adapter type surfaced only in the gallery UI. */
  type?: string | null;
};

export type GalleryLora = LoraListItem;

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

export type LoraBulkAction = Schemas['BulkActionRequest']['action'];

export type LoraBulkActionRequest = Schemas['BulkActionRequest'];

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

export type LoraUpdateType = 'weight' | 'active';

export interface LoraUpdatePayload {
  id: string;
  type: LoraUpdateType;
  weight?: number;
  active?: boolean;
}
