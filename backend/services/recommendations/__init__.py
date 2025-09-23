"""Recommendation service package exports."""

from .builder import RecommendationServiceBuilder
from .builders import (
    EmbeddingStack,
    PersistenceComponents,
    UseCaseBundle,
    build_embedding_stack,
    build_persistence_components,
    build_use_cases,
)
from .config import RecommendationConfig
from .embedding_batch_runner import EmbeddingBatchRunner
from .embedding_computer import EmbeddingComputer
from .embedding_coordinator import EmbeddingCoordinator
from .embedding_manager import EmbeddingManager
from .embedding_repository import LoRAEmbeddingRepository
from .feedback_manager import FeedbackManager
from .metrics import RecommendationMetrics, RecommendationMetricsTracker
from .model_bootstrap import RecommendationModelBootstrap
from .persistence_manager import RecommendationPersistenceManager
from .persistence_service import RecommendationPersistenceService
from .repository import RecommendationRepository
from .service import RecommendationService
from .similarity_index_builder import SimilarityIndexBuilder
from .stats_reporter import StatsReporter
from .use_cases import PromptRecommendationUseCase, SimilarLoraUseCase

__all__ = [
    'RecommendationConfig',
    'EmbeddingStack',
    'RecommendationServiceBuilder',
    'EmbeddingBatchRunner',
    'EmbeddingCoordinator',
    'EmbeddingComputer',
    'EmbeddingManager',
    'LoRAEmbeddingRepository',
    'FeedbackManager',
    'RecommendationMetrics',
    'RecommendationMetricsTracker',
    'RecommendationModelBootstrap',
    'PersistenceComponents',
    'RecommendationPersistenceManager',
    'RecommendationPersistenceService',
    'RecommendationRepository',
    'RecommendationService',
    'SimilarityIndexBuilder',
    'StatsReporter',
    'SimilarLoraUseCase',
    'PromptRecommendationUseCase',
    'UseCaseBundle',
    'build_embedding_stack',
    'build_persistence_components',
    'build_use_cases',
]
