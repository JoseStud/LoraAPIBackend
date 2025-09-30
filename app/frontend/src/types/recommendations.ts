/**
 * Type definitions mirroring backend/schemas/recommendations.py.
 */

import type { BackendSchemas } from './generated';
import type { JsonObject } from './json';

type Schemas = BackendSchemas;

export type PromptRecommendationRequest = Omit<
  Schemas['PromptRecommendationRequest'],
  'technical_requirements'
> & {
  technical_requirements?: JsonObject | null;
};

export type RecommendationRequest = PromptRecommendationRequest;

export type RecommendationItem = Omit<Schemas['RecommendationItem'], 'metadata'> & {
  metadata?: JsonObject | null;
};

export type RecommendationResponse = Omit<
  Schemas['RecommendationResponse'],
  'recommendations' | 'recommendation_config'
> & {
  recommendations: RecommendationItem[];
  recommendation_config: JsonObject;
};

export interface SimilarityRequest {
  target_lora_id: string;
  limit?: number;
  include_explanations?: boolean;
  similarity_threshold?: number;
  diversify_results?: boolean;
}

export type UserFeedbackType = Schemas['UserFeedbackRequest']['feedback_type'];

export type UserFeedbackRequest = Schemas['UserFeedbackRequest'];

export type UserPreferenceType = string;

export type UserPreferenceRequest = Omit<Schemas['UserPreferenceRequest'], 'explicit'> & {
  explicit?: boolean;
};

export type RecommendationStats = Schemas['RecommendationStats'];

export type EmbeddingStatus = Schemas['EmbeddingStatus'];

export type BatchEmbeddingRequest = Schemas['BatchEmbeddingRequest'];

export type BatchEmbeddingResponse = Schemas['BatchEmbeddingResponse'];
