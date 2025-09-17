"""Tests for the recommendation system."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from backend.models import Adapter, LoRAEmbedding
from backend.schemas.recommendations import RecommendationItem
from backend.services.recommendations import RecommendationService


@pytest.fixture
def sample_adapter():
    """Create a sample adapter for testing."""
    return Adapter(
        id="test-adapter-1",
        name="Test Character LoRA",
        description="A beautiful anime character with long hair and blue eyes",
        author_username="test_author",
        tags=["anime", "character", "blue_eyes", "long_hair"],
        trained_words=["test_character", "blue_eyes"],
        triggers=["test_character"],
        file_path="/test/path/character.safetensors",
        sd_version="SD1.5",
        nsfw_level=0,
        supports_generation=True,
        stats={
            "downloadCount": 1500,
            "favoriteCount": 120,
            "rating": 4.5,
            "commentCount": 25,
        },
        published_at=datetime.now(timezone.utc),
        created_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def sample_adapters():
    """Create multiple sample adapters for testing."""
    adapters = []
    
    # Anime character LoRA
    adapters.append(Adapter(
        id="anime-char-1",
        name="Anime Girl LoRA",
        description="Cute anime girl with pink hair and green eyes",
        tags=["anime", "character", "pink_hair", "green_eyes"],
        trained_words=["anime_girl", "pink_hair"],
        file_path="/test/anime1.safetensors",
        sd_version="SD1.5",
        nsfw_level=0,
        stats={"downloadCount": 2000, "rating": 4.7},
    ))
    
    # Realistic portrait LoRA
    adapters.append(Adapter(
        id="realistic-1",
        name="Realistic Portrait LoRA",
        description="Photorealistic human portraits with detailed features",
        tags=["realistic", "portrait", "photography"],
        trained_words=["realistic_portrait", "detailed"],
        file_path="/test/realistic1.safetensors",
        sd_version="SDXL",
        nsfw_level=0,
        stats={"downloadCount": 800, "rating": 4.2},
    ))
    
    # Style LoRA
    adapters.append(Adapter(
        id="style-1",
        name="Watercolor Style LoRA",
        description="Beautiful watercolor painting style with soft colors",
        tags=["style", "watercolor", "painting", "artistic"],
        trained_words=["watercolor_style", "painting"],
        file_path="/test/style1.safetensors",
        sd_version="SD1.5",
        nsfw_level=0,
        stats={"downloadCount": 1200, "rating": 4.4},
    ))
    
    return adapters


class TestRecommendationService:
    """Test the RecommendationService class."""

    def test_initialization(self, db_session):
        """Test service initialization."""
        service = RecommendationService(db_session, gpu_enabled=False)
        
        assert service.db_session == db_session
        assert service.device == 'cpu'
        assert not service.gpu_enabled
        assert service._total_queries == 0

    def test_initialization_with_gpu(self, db_session):
        """Test service initialization with GPU enabled."""
        with patch('torch.cuda.is_available', return_value=True):
            service = RecommendationService(db_session, gpu_enabled=True)
            
            assert service.gpu_enabled
            assert service.device == 'cuda'

    @pytest.mark.asyncio
    async def test_compute_embeddings_for_lora(self, db_session, sample_adapter):
        """Test computing embeddings for a single LoRA."""
        service = RecommendationService(db_session, gpu_enabled=False)
        
        # Add the adapter to the database
        db_session.add(sample_adapter)
        db_session.commit()
        
        # Mock the feature extractor
        with patch.object(service, '_get_feature_extractor') as mock_extractor:
            mock_features = {
                'semantic_embedding': [0.1] * 1024,
                'artistic_embedding': [0.2] * 384,
                'technical_embedding': [0.3] * 768,
                'extracted_keywords': ['anime', 'character'],
                'keyword_scores': [0.9, 0.8],
                'predicted_style': 'anime',
                'style_confidence': 0.85,
                'quality_score': 0.7,
            }
            
            mock_extractor_instance = MagicMock()
            mock_extractor_instance.extract_advanced_features.return_value = mock_features
            mock_extractor.return_value = mock_extractor_instance
            
            # Test embedding computation
            result = await service.compute_embeddings_for_lora(sample_adapter.id)
            
            assert result is True
            
            # Check that embedding was stored in database
            embedding = db_session.get(LoRAEmbedding, sample_adapter.id)
            assert embedding is not None
            assert embedding.extracted_keywords == ['anime', 'character']
            assert embedding.predicted_style == 'anime'

    @pytest.mark.asyncio
    async def test_compute_embeddings_for_nonexistent_lora(self, db_session):
        """Test computing embeddings for non-existent LoRA."""
        service = RecommendationService(db_session, gpu_enabled=False)
        
        with pytest.raises(ValueError, match="Adapter nonexistent not found"):
            await service.compute_embeddings_for_lora("nonexistent")

    @pytest.mark.asyncio
    async def test_batch_compute_embeddings(self, db_session, sample_adapters):
        """Test batch computing embeddings."""
        service = RecommendationService(db_session, gpu_enabled=False)
        
        # Add adapters to database
        for adapter in sample_adapters:
            db_session.add(adapter)
        db_session.commit()
        
        # Mock the feature extractor
        with patch.object(service, '_get_feature_extractor') as mock_extractor:
            mock_features = {
                'semantic_embedding': [0.1] * 1024,
                'artistic_embedding': [0.2] * 384,
                'technical_embedding': [0.3] * 768,
                'extracted_keywords': ['test'],
                'quality_score': 0.7,
            }
            
            mock_extractor_instance = MagicMock()
            mock_extractor_instance.extract_advanced_features.return_value = mock_features
            mock_extractor.return_value = mock_extractor_instance
            
            # Test batch processing
            adapter_ids = [a.id for a in sample_adapters]
            result = await service.batch_compute_embeddings(adapter_ids)
            
            assert result['processed_count'] == len(sample_adapters)
            assert result['error_count'] == 0
            assert 'processing_time_seconds' in result

    @pytest.mark.asyncio
    async def test_get_recommendations_for_prompt(self, db_session, sample_adapters):
        """Test getting recommendations for a prompt."""
        service = RecommendationService(db_session, gpu_enabled=False)
        
        # Add adapters to database
        for adapter in sample_adapters:
            adapter.active = True
            db_session.add(adapter)
        db_session.commit()
        
        # Create mock embeddings
        for adapter in sample_adapters:
            embedding = LoRAEmbedding(
                adapter_id=adapter.id,
                semantic_embedding=b'mock_embedding_data',
                predicted_style='anime' if 'anime' in adapter.tags else 'realistic',
            )
            db_session.add(embedding)
        db_session.commit()
        
        # Mock the semantic embedder
        with patch.object(service, '_get_semantic_embedder') as mock_embedder:
            mock_embedder_instance = MagicMock()
            mock_embedder_instance.primary_model.encode.return_value = [0.1] * 1024
            mock_embedder.return_value = mock_embedder_instance
            
            with patch('pickle.loads') as mock_pickle:
                mock_pickle.return_value = [0.1] * 1024
                
                # Test prompt recommendations
                recommendations = await service.get_recommendations_for_prompt(
                    prompt="anime girl with blue eyes",
                    limit=2,
                )
                
                assert len(recommendations) <= 2
                for rec in recommendations:
                    assert isinstance(rec, RecommendationItem)
                    assert rec.similarity_score >= 0
                    assert rec.final_score >= 0

    def test_get_recommendation_stats(self, db_session, sample_adapters):
        """Test getting recommendation statistics."""
        service = RecommendationService(db_session, gpu_enabled=False)
        
        # Add some test data
        for adapter in sample_adapters:
            adapter.active = True
            db_session.add(adapter)
        db_session.commit()
        
        # Get stats
        stats = service.get_recommendation_stats()
        
        assert stats.total_loras == len(sample_adapters)
        assert stats.loras_with_embeddings == 0  # No embeddings yet
        assert stats.embedding_coverage == 0.0
        assert stats.avg_recommendation_time_ms >= 0
        assert stats.model_memory_usage_gb >= 0

    def test_get_embedding_status_nonexistent(self, db_session):
        """Test getting embedding status for non-existent LoRA."""
        service = RecommendationService(db_session, gpu_enabled=False)
        
        status = service.get_embedding_status("nonexistent")
        
        assert status.adapter_id == "nonexistent"
        assert not status.has_semantic_embedding
        assert not status.has_artistic_embedding
        assert not status.has_technical_embedding
        assert status.needs_recomputation

    def test_get_embedding_status_existing(self, db_session, sample_adapter):
        """Test getting embedding status for existing LoRA with embeddings."""
        service = RecommendationService(db_session, gpu_enabled=False)
        
        # Add adapter and embedding
        db_session.add(sample_adapter)
        embedding = LoRAEmbedding(
            adapter_id=sample_adapter.id,
            semantic_embedding=b'test_data',
            artistic_embedding=b'test_data',
            extracted_keywords=['test'],
        )
        db_session.add(embedding)
        db_session.commit()
        
        status = service.get_embedding_status(sample_adapter.id)
        
        assert status.adapter_id == sample_adapter.id
        assert status.has_semantic_embedding
        assert status.has_artistic_embedding
        assert not status.has_technical_embedding  # Not set in test
        assert status.has_extracted_features
        assert not status.needs_recomputation


class TestRecommendationModels:
    """Test the recommendation model components."""

    def test_lora_semantic_embedder_initialization(self):
        """Test LoRASemanticEmbedder initialization."""
        with patch('sentence_transformers.SentenceTransformer'):
            from backend.services.recommendation_models import LoRASemanticEmbedder
            
            embedder = LoRASemanticEmbedder(device='cpu', batch_size=16, mixed_precision=False)
            
            assert embedder.device == 'cpu'
            assert embedder.batch_size == 16
            assert not embedder.mixed_precision

    def test_lora_semantic_embedder_prepare_text(self, sample_adapter):
        """Test text preparation for embeddings."""
        with patch('sentence_transformers.SentenceTransformer'):
            from backend.services.recommendation_models import LoRASemanticEmbedder
            
            embedder = LoRASemanticEmbedder(device='cpu')
            texts = embedder._prepare_multi_modal_text(sample_adapter)
            
            assert 'semantic' in texts
            assert 'artistic' in texts
            assert 'technical' in texts
            
            # Check that description is included
            assert sample_adapter.description in texts['semantic']
            
            # Check that SD version is in technical
            assert sample_adapter.sd_version in texts['technical']

    def test_gpu_feature_extractor_fallback_methods(self, sample_adapter):
        """Test fallback methods when advanced NLP libraries aren't available."""
        from backend.services.recommendation_models import GPULoRAFeatureExtractor
        
        extractor = GPULoRAFeatureExtractor(device='cpu')
        
        # Test fallback keyword extraction
        result = extractor._fallback_keyword_extraction("This is a test description with anime character")
        assert 'extracted_keywords' in result
        assert 'keyword_scores' in result
        assert len(result['extracted_keywords']) > 0
        
        # Test fallback sentiment analysis
        result = extractor._fallback_sentiment_analysis("This is a great and amazing LoRA")
        assert result['sentiment_label'] == 'POSITIVE'
        assert result['sentiment_score'] > 0.5
        
        # Test fallback style classification
        result = extractor._fallback_style_classification("This is an anime style digital art")
        assert result['predicted_style'] in ['anime', 'digital art']
        assert result['style_confidence'] >= 0


@pytest.mark.asyncio
class TestRecommendationIntegration:
    """Integration tests for the recommendation system."""

    @pytest.mark.asyncio
    async def test_end_to_end_recommendation_flow(self, db_session, sample_adapters):
        """Test the complete recommendation flow."""
        service = RecommendationService(db_session, gpu_enabled=False)
        
        # Add adapters to database
        for adapter in sample_adapters:
            adapter.active = True
            db_session.add(adapter)
        db_session.commit()
        
        # Mock all the ML components
        with patch.object(service, '_get_feature_extractor') as mock_extractor, \
             patch.object(service, '_get_semantic_embedder') as mock_embedder:
            
            # Setup mock feature extractor
            mock_features = {
                'semantic_embedding': [0.1] * 1024,
                'artistic_embedding': [0.2] * 384,
                'technical_embedding': [0.3] * 768,
                'extracted_keywords': ['anime', 'character'],
                'quality_score': 0.7,
            }
            mock_extractor_instance = MagicMock()
            mock_extractor_instance.extract_advanced_features.return_value = mock_features
            mock_extractor.return_value = mock_extractor_instance
            
            # Setup mock embedder
            mock_embedder_instance = MagicMock()
            mock_embedder_instance.primary_model.encode.return_value = [0.1] * 1024
            
            # Mock batch_encode_collection to return proper 2D arrays
            mock_batch_embeddings = {
                'semantic': np.array([[0.1] * 1024, [0.2] * 1024, [0.3] * 1024]).astype('float32'),
                'artistic': np.array([[0.1] * 384, [0.2] * 384, [0.3] * 384]).astype('float32'),
                'technical': np.array([[0.1] * 768, [0.2] * 768, [0.3] * 768]).astype('float32'),
            }
            mock_embedder_instance.batch_encode_collection.return_value = mock_batch_embeddings
            mock_embedder.return_value = mock_embedder_instance
            
            # Step 1: Compute embeddings
            adapter_ids = [a.id for a in sample_adapters]
            batch_result = await service.batch_compute_embeddings(adapter_ids)
            
            assert batch_result['processed_count'] > 0
            
            # Step 2: Get similar LoRAs
            # Mock the recommendation engine to avoid the embedding issue
            with patch.object(service, '_get_recommendation_engine') as mock_engine_method:
                mock_engine = MagicMock()

                # Mock the get_recommendations method to return proper results
                mock_recommendations = [
                    {
                        'lora_id': sample_adapters[1].id,  # Return a different adapter as recommendation
                        'similarity_score': 0.85,
                        'final_score': 0.85,
                        'explanation': 'High semantic similarity',
                        'semantic_similarity': 0.9,
                        'artistic_similarity': 0.8,
                        'technical_similarity': 0.7,
                        'quality_boost': 0.1,
                        'popularity_boost': 0.05,
                    },
                ]
                mock_engine.get_recommendations.return_value = mock_recommendations
                mock_engine_method.return_value = mock_engine
                
                recommendations = await service.get_similar_loras(
                    target_lora_id=sample_adapters[0].id,
                    limit=2,
                )
                
                assert len(recommendations) <= 2
                
            # Step 3: Get prompt recommendations
            with patch('pickle.loads', return_value=[0.1] * 1024):
                prompt_recs = await service.get_recommendations_for_prompt(
                    prompt="anime character with blue eyes",
                    limit=2,
                )
                
                assert len(prompt_recs) <= 2
            
            # Step 4: Get statistics
            stats = service.get_recommendation_stats()
            assert stats.total_loras == len(sample_adapters)
            assert stats.loras_with_embeddings > 0
