/**
 * Type definitions mirroring backend/schemas/recommendations.py.
 */

import type { JsonObject } from './json';

export interface RecommendationRequest {
  target_lora_id?: string | null;
  prompt?: string | null;
  active_loras?: string[];
  limit?: number;
  include_explanations?: boolean;
  weights?: Record<string, number> | null;
  filters?: JsonObject | null;
}

export interface RecommendationItem {
  lora_id: string;
  lora_name: string;
  lora_description?: string | null;
  similarity_score: number;
  final_score: number;
  explanation: string;
  semantic_similarity?: number | null;
  artistic_similarity?: number | null;
  technical_similarity?: number | null;
  quality_boost?: number | null;
  popularity_boost?: number | null;
  recency_boost?: number | null;
  metadata?: JsonObject | null;
}

export interface RecommendationResponse {
  target_lora_id?: string | null;
  prompt?: string | null;
  recommendations: RecommendationItem[];
  total_candidates: number;
  processing_time_ms: number;
  recommendation_config: JsonObject;
  generated_at: string;
}

export interface PromptRecommendationRequest {
  prompt: string;
  active_loras?: string[];
  limit?: number;
  include_explanations?: boolean;
  style_preference?: string | null;
  technical_requirements?: JsonObject | null;
}

export interface SimilarityRequest {
  target_lora_id: string;
  limit?: number;
  include_explanations?: boolean;
  similarity_threshold?: number;
  diversify_results?: boolean;
}

export type UserFeedbackType = 'positive' | 'negative' | 'activated' | 'ignored' | 'dismissed';

export interface UserFeedbackRequest {
  session_id: string;
  recommended_lora_id: string;
  feedback_type: UserFeedbackType;
  feedback_reason?: string | null;
  implicit_signal?: boolean;
}

export type UserPreferenceType = 'archetype' | 'style' | 'technical' | 'author' | 'tag';

export interface UserPreferenceRequest {
  preference_type: UserPreferenceType;
  preference_value: string;
  confidence: number;
  explicit?: boolean;
}

export interface RecommendationStats {
  total_loras: number;
  loras_with_embeddings: number;
  embedding_coverage: number;
  avg_recommendation_time_ms: number;
  cache_hit_rate: number;
  total_sessions: number;
  user_preferences_count: number;
  feedback_count: number;
  model_memory_usage_gb: number;
  last_index_update: string;
}

export interface EmbeddingStatus {
  adapter_id: string;
  has_semantic_embedding: boolean;
  has_artistic_embedding: boolean;
  has_technical_embedding: boolean;
  has_extracted_features: boolean;
  last_computed?: string | null;
  needs_recomputation?: boolean;
}

export interface BatchEmbeddingRequest {
  adapter_ids?: string[];
  force_recompute?: boolean;
  compute_all?: boolean;
  batch_size?: number;
}

export interface BatchEmbeddingResponse {
  processed_count: number;
  skipped_count: number;
  error_count: number;
  processing_time_seconds: number;
  errors: Array<Record<string, string>>;
  completed_at: string;
}
