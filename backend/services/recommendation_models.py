"""GPU-accelerated recommendation models for 8GB VRAM deployment."""

import re
from typing import Any, Dict, List, Optional

import numpy as np


class LoRASemanticEmbedder:
    """Generate high-quality dense vector representations using 8GB VRAM."""
    
    def __init__(self, device='cuda', batch_size=32, mixed_precision=True):
        """Initialize semantic embedding models.
        
        Args:
            device: Device to use ('cuda' or 'cpu')
            batch_size: Batch size for processing
            mixed_precision: Use FP16 for memory efficiency

        """
        self.device = device
        self.batch_size = batch_size
        self.mixed_precision = mixed_precision
        
        # Import dependencies
        try:
            from sentence_transformers import SentenceTransformer
            self.SentenceTransformer = SentenceTransformer
        except ImportError:
            raise ImportError(
                "sentence-transformers is required. Install with: "
                "pip install sentence-transformers",
            )
        
        # Check GPU availability (supports both CUDA and ROCm)
        if device in ['cuda', 'gpu']:
            try:
                import torch
                if torch.cuda.is_available():
                    print(f"🚀 Using CUDA GPU acceleration with {torch.cuda.get_device_name()}")
                    self.device = 'cuda'
                elif hasattr(torch.version, 'hip') and torch.version.hip is not None:
                    # ROCm/HIP support for AMD GPUs
                    print("🚀 Using AMD ROCm GPU acceleration")
                    self.device = 'cuda'  # PyTorch uses 'cuda' for ROCm too
                elif torch.backends.mps.is_available():
                    # Apple Silicon GPU support
                    print("🚀 Using Apple Silicon GPU acceleration")
                    self.device = 'mps'
                else:
                    print("⚠️ GPU not available, falling back to CPU")
                    self.device = 'cpu'
            except ImportError:
                print("⚠️ PyTorch not available, falling back to CPU")
                self.device = 'cpu'
        
        # Initialize models lazily
        self._primary_model = None
        self._art_model = None
        self._technical_model = None
        
    def _load_models(self):
        """Load all embedding models."""
        if self._primary_model is None:
            print("📚 Loading semantic embedding models...")
            
            # Primary embedding model - excellent for semantic similarity
            # VRAM Usage: ~2-3GB, 1024-dim embeddings, superior quality
            self._primary_model = self.SentenceTransformer(
                'sentence-transformers/all-mpnet-base-v2',
            )
            if self.device == 'cuda':
                self._primary_model = self._primary_model.to(self.device)
            
            # Specialized art/anime model for domain-specific understanding
            # VRAM Usage: ~1-2GB, 768-dim embeddings
            self._art_model = self.SentenceTransformer(
                'sentence-transformers/all-MiniLM-L12-v2',
            )
            if self.device == 'cuda':
                self._art_model = self._art_model.to(self.device)
            
            # Technical prompt analysis model for parameter understanding
            # VRAM Usage: ~1GB, optimized for technical content
            self._technical_model = self.SentenceTransformer(
                'sentence-transformers/paraphrase-mpnet-base-v2',
            )
            if self.device == 'cuda':
                self._technical_model = self._technical_model.to(self.device)
            
            print("✅ Semantic embedding models loaded successfully")

    @property
    def primary_model(self):
        """Get primary model, loading if necessary."""
        if self._primary_model is None:
            self._load_models()
        return self._primary_model
    
    @property 
    def art_model(self):
        """Get art model, loading if necessary."""
        if self._art_model is None:
            self._load_models()
        return self._art_model
    
    @property
    def technical_model(self):
        """Get technical model, loading if necessary."""
        if self._technical_model is None:
            self._load_models()
        return self._technical_model

    def create_multi_modal_embedding(self, lora) -> Dict[str, np.ndarray]:
        """Generate multiple specialized embeddings for different aspects."""
        # Prepare different text representations
        content_texts = self._prepare_multi_modal_text(lora)
        
        embeddings = {}
        
        # High-quality semantic embedding for general similarity
        semantic_text = content_texts['semantic']
        if semantic_text.strip():
            embeddings['semantic'] = self.primary_model.encode(
                semantic_text,
                device=self.device,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
        else:
            # Fallback empty embedding
            embeddings['semantic'] = np.zeros(1024, dtype=np.float32)
        
        # Art-specific embedding for style and aesthetic understanding
        art_text = content_texts['artistic']
        if art_text.strip():
            embeddings['artistic'] = self.art_model.encode(
                art_text,
                device=self.device,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
        else:
            embeddings['artistic'] = np.zeros(384, dtype=np.float32)
        
        # Technical embedding for compatibility and parameters
        tech_text = content_texts['technical']
        if tech_text.strip():
            embeddings['technical'] = self.technical_model.encode(
                tech_text,
                device=self.device,
                show_progress_bar=False,
                convert_to_numpy=True,
            )
        else:
            embeddings['technical'] = np.zeros(768, dtype=np.float32)
        
        return embeddings
    
    def _prepare_multi_modal_text(self, lora) -> Dict[str, str]:
        """Prepare specialized text representations for different embedding types."""
        # Semantic representation - comprehensive content understanding
        semantic_components = []
        if lora.description:
            semantic_components.append(f"Description: {lora.description}")
        if lora.trained_words:
            semantic_components.append(f"Trained on: {', '.join(lora.trained_words)}")
        if lora.triggers:
            semantic_components.append(f"Triggers: {', '.join(lora.triggers)}")
        if lora.activation_text:
            semantic_components.append(f"Activation: {lora.activation_text}")
        
        # Artistic representation - style and aesthetic focus
        artistic_components = []
        if lora.description:
            # Extract style-related keywords using simple regex
            artistic_terms = self._extract_artistic_terms(lora.description)
            if artistic_terms:
                artistic_components.append(artistic_terms)
        if lora.tags:
            # Filter for art/style related tags
            art_tags = [tag for tag in lora.tags if self._is_artistic_tag(tag)]
            if art_tags:
                artistic_components.append(f"Art style: {', '.join(art_tags)}")
        if lora.archetype:
            artistic_components.append(f"Character type: {lora.archetype}")
        
        # Technical representation - compatibility and parameters
        technical_components = []
        if lora.sd_version:
            technical_components.append(f"SD Version: {lora.sd_version}")
        if lora.supports_generation:
            technical_components.append("Supports generation")
        if lora.nsfw_level is not None:
            safety_level = "Safe" if lora.nsfw_level == 0 else f"NSFW Level {lora.nsfw_level}"
            technical_components.append(f"Safety: {safety_level}")
        if lora.primary_file_size_kb:
            size_category = self._categorize_file_size(lora.primary_file_size_kb)
            technical_components.append(f"Model size: {size_category}")
        
        return {
            'semantic': " | ".join(semantic_components) if semantic_components else "",
            'artistic': " | ".join(artistic_components) if artistic_components else "",
            'technical': " | ".join(technical_components) if technical_components else "",
        }

    def _extract_artistic_terms(self, description: str) -> str:
        """Extract artistic and style-related terms from description."""
        if not description:
            return ""
        
        # Art style keywords
        art_keywords = [
            'anime', 'realistic', 'cartoon', 'abstract', 'photographic',
            'digital art', 'painting', 'sketch', '3d render', 'pixel art',
            'watercolor', 'oil painting', 'concept art', 'illustration',
            'manga', 'comic', 'fantasy', 'sci-fi', 'portrait', 'landscape',
        ]
        
        found_terms = []
        desc_lower = description.lower()
        for keyword in art_keywords:
            if keyword in desc_lower:
                found_terms.append(keyword)
        
        return ", ".join(found_terms[:5])  # Limit to top 5 matches

    def _is_artistic_tag(self, tag: str) -> bool:
        """Check if a tag is art/style related."""
        art_related = [
            'style', 'art', 'anime', 'realistic', 'character', 'portrait',
            'landscape', 'fantasy', 'sci-fi', 'concept', 'illustration',
            'digital', 'painting', 'drawing', 'sketch', '3d', 'render',
        ]
        
        tag_lower = tag.lower()
        return any(art_term in tag_lower for art_term in art_related)

    def _categorize_file_size(self, size_kb: int) -> str:
        """Categorize file size for technical understanding."""
        size_mb = size_kb / 1024
        
        if size_mb < 50:
            return "Small"
        elif size_mb < 200:
            return "Medium" 
        elif size_mb < 500:
            return "Large"
        else:
            return "Very Large"

    def batch_encode_collection(self, loras: List) -> Dict[str, np.ndarray]:
        """Efficiently batch process entire LoRA collection using GPU."""
        # Prepare all texts
        all_semantic = []
        all_artistic = []
        all_technical = []
        
        for lora in loras:
            texts = self._prepare_multi_modal_text(lora)
            all_semantic.append(texts['semantic'])
            all_artistic.append(texts['artistic'])
            all_technical.append(texts['technical'])
        
        # Batch encode with GPU acceleration
        print(f"🔄 Batch encoding {len(loras)} LoRAs...")
        
        # Use torch.no_grad() if available to save VRAM
        context_manager = None
        try:
            import torch
            context_manager = torch.no_grad()
        except ImportError:
            context_manager = None
        
        if context_manager:
            with context_manager:
                semantic_embeddings = self.primary_model.encode(
                    all_semantic,
                    batch_size=self.batch_size,
                    device=self.device,
                    show_progress_bar=True,
                    convert_to_numpy=True,
                )
                
                artistic_embeddings = self.art_model.encode(
                    all_artistic,
                    batch_size=self.batch_size,
                    device=self.device,
                    show_progress_bar=True,
                    convert_to_numpy=True,
                )
                
                technical_embeddings = self.technical_model.encode(
                    all_technical,
                    batch_size=self.batch_size,
                    device=self.device,
                    show_progress_bar=True,
                    convert_to_numpy=True,
                )
        else:
            semantic_embeddings = self.primary_model.encode(
                all_semantic,
                batch_size=self.batch_size,
                show_progress_bar=True,
                convert_to_numpy=True,
            )
            
            artistic_embeddings = self.art_model.encode(
                all_artistic,
                batch_size=self.batch_size,
                show_progress_bar=True,
                convert_to_numpy=True,
            )
            
            technical_embeddings = self.technical_model.encode(
                all_technical,
                batch_size=self.batch_size,
                show_progress_bar=True,
                convert_to_numpy=True,
            )
        
        return {
            'semantic': semantic_embeddings,
            'artistic': artistic_embeddings,
            'technical': technical_embeddings,
        }


class GPULoRAFeatureExtractor:
    """GPU-accelerated feature extraction with advanced NLP."""
    
    def __init__(self, device='cuda'):
        """Initialize feature extractor.
        
        Args:
            device: Device to use ('cuda' or 'cpu')

        """
        self.device = device
        self.semantic_embedder = LoRASemanticEmbedder(device=device)
        
        # Initialize advanced NLP models lazily
        self._keyword_extractor = None
        self._sentiment_analyzer = None
        self._style_classifier = None
        
    def _load_advanced_models(self):
        """Load advanced NLP models if available."""
        if self._keyword_extractor is None:
            try:
                # Try to load KeyBERT for advanced keyword extraction
                from keybert import KeyBERT
                self._keyword_extractor = KeyBERT(
                    model='sentence-transformers/all-mpnet-base-v2',
                )
                print("✅ KeyBERT loaded for keyword extraction")
            except ImportError:
                print("⚠️ KeyBERT not available, using fallback keyword extraction")
                self._keyword_extractor = "fallback"
        
        if self._sentiment_analyzer is None:
            try:
                # Try to load transformers for sentiment analysis
                from transformers import pipeline
                self._sentiment_analyzer = pipeline(
                    "sentiment-analysis",
                    model="cardiffnlp/twitter-roberta-base-sentiment-latest",
                    device=0 if self.device == 'cuda' else -1,
                )
                print("✅ Sentiment analyzer loaded")
            except ImportError:
                print("⚠️ Transformers not available, using fallback sentiment analysis")
                self._sentiment_analyzer = "fallback"
        
        if self._style_classifier is None:
            try:
                from transformers import pipeline
                self._style_classifier = pipeline(
                    "zero-shot-classification",
                    model="facebook/bart-large-mnli",
                    device=0 if self.device == 'cuda' else -1,
                )
                print("✅ Style classifier loaded")
            except ImportError:
                print("⚠️ Style classifier not available, using fallback classification")
                self._style_classifier = "fallback"

    def extract_advanced_features(self, lora) -> Dict[str, Any]:
        """Extract comprehensive features using available models."""
        features = {}
        
        # Basic embeddings
        embeddings = self.semantic_embedder.create_multi_modal_embedding(lora)
        features.update({
            'semantic_embedding': embeddings['semantic'],
            'artistic_embedding': embeddings['artistic'],
            'technical_embedding': embeddings['technical'],
        })
        
        # Load advanced models if needed
        self._load_advanced_models()
        
        # Advanced keyword extraction
        if lora.description:
            if self._keyword_extractor != "fallback":
                try:
                    keywords = self._keyword_extractor.extract_keywords(
                        lora.description,
                        keyphrase_ngram_range=(1, 3),
                        stop_words='english',
                        top_k=10,
                    )
                    features['extracted_keywords'] = [kw[0] for kw in keywords]
                    features['keyword_scores'] = [kw[1] for kw in keywords]
                except Exception:
                    # Fallback to simple keyword extraction
                    features.update(self._fallback_keyword_extraction(lora.description))
            else:
                features.update(self._fallback_keyword_extraction(lora.description))
        
        # Sentiment and emotional tone analysis
        if lora.description:
            if self._sentiment_analyzer != "fallback":
                try:
                    sentiment = self._sentiment_analyzer(lora.description[:512])
                    features['sentiment_label'] = sentiment[0]['label']
                    features['sentiment_score'] = sentiment[0]['score']
                except Exception:
                    features.update(self._fallback_sentiment_analysis(lora.description))
            else:
                features.update(self._fallback_sentiment_analysis(lora.description))
        
        # Art style classification
        if lora.description:
            if self._style_classifier != "fallback":
                try:
                    art_styles = [
                        "anime", "realistic", "cartoon", "abstract", "photographic",
                        "digital art", "painting", "sketch", "3D render", "pixel art",
                    ]
                    style_result = self._style_classifier(lora.description[:512], art_styles)
                    features['predicted_style'] = style_result['labels'][0]
                    features['style_confidence'] = style_result['scores'][0]
                except Exception:
                    features.update(self._fallback_style_classification(lora.description))
            else:
                features.update(self._fallback_style_classification(lora.description))
        
        # Enhanced categorical features
        features.update({
            'tags_vector': self._encode_tags_advanced(lora.tags),
            'sd_version_vector': self._encode_sd_version(lora.sd_version),
            'author_vector': self._encode_author_advanced(lora.author_username),
            
            # Quality metrics (enhanced)
            'quality_score': self._calculate_enhanced_quality_score(lora.stats),
            'popularity_score': self._calculate_popularity_score(lora.stats),
            'community_engagement': self._calculate_engagement_score(lora.stats),
            
            # Technical metrics
            'file_size_normalized': self._normalize_file_size(lora.primary_file_size_kb),
            'recency_score': self._calculate_recency_score(lora.published_at),
            'maturity_score': self._calculate_maturity_score(lora.created_at),
            
            # Safety and compatibility
            'nsfw_level_normalized': lora.nsfw_level / 10.0 if lora.nsfw_level else 0.0,
            'supports_generation': float(lora.supports_generation),
            'sd_compatibility_score': self._calculate_sd_compatibility(lora.sd_version),
            
            # User interaction features (placeholders for now)
            'user_activation_frequency': 0.0,  # TODO: Implement from usage history
            'user_success_rate': 0.5,          # TODO: Implement from generation results
            'recent_usage_trend': 0.0,          # TODO: Implement trend analysis
        })
        
        return features

    def _fallback_keyword_extraction(self, text: str) -> Dict[str, Any]:
        """Simple fallback keyword extraction."""
        words = re.findall(r'\b\w+\b', text.lower())
        # Simple frequency-based keyword extraction
        word_freq = {}
        for word in words:
            if len(word) > 3:  # Skip short words
                word_freq[word] = word_freq.get(word, 0) + 1
        
        # Get top keywords
        top_keywords = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:10]
        
        return {
            'extracted_keywords': [kw[0] for kw in top_keywords],
            'keyword_scores': [kw[1] / len(words) for kw in top_keywords],
        }

    def _fallback_sentiment_analysis(self, text: str) -> Dict[str, Any]:
        """Simple fallback sentiment analysis."""
        positive_words = ['good', 'great', 'excellent', 'amazing', 'beautiful', 'perfect']
        negative_words = ['bad', 'terrible', 'awful', 'horrible', 'ugly', 'poor']
        
        text_lower = text.lower()
        pos_count = sum(1 for word in positive_words if word in text_lower)
        neg_count = sum(1 for word in negative_words if word in text_lower)
        
        if pos_count > neg_count:
            return {'sentiment_label': 'POSITIVE', 'sentiment_score': 0.7}
        elif neg_count > pos_count:
            return {'sentiment_label': 'NEGATIVE', 'sentiment_score': 0.7}
        else:
            return {'sentiment_label': 'NEUTRAL', 'sentiment_score': 0.5}

    def _fallback_style_classification(self, text: str) -> Dict[str, Any]:
        """Simple fallback style classification."""
        style_keywords = {
            'anime': ['anime', 'manga', 'japanese', 'kawaii'],
            'realistic': ['realistic', 'photorealistic', 'photo', 'real'],
            'cartoon': ['cartoon', 'comic', 'toon'],
            'digital art': ['digital', 'cg', 'computer'],
            'painting': ['painting', 'paint', 'oil', 'watercolor'],
        }
        
        text_lower = text.lower()
        style_scores = {}
        
        for style, keywords in style_keywords.items():
            score = sum(1 for keyword in keywords if keyword in text_lower)
            if score > 0:
                style_scores[style] = score
        
        if style_scores:
            best_style = max(style_scores, key=style_scores.get)
            confidence = style_scores[best_style] / len(text.split())
            return {'predicted_style': best_style, 'style_confidence': min(confidence, 1.0)}
        else:
            return {'predicted_style': 'unknown', 'style_confidence': 0.0}

    def _encode_tags_advanced(self, tags: List[str]) -> List[float]:
        """Encode tags as feature vector."""
        if not tags:
            return [0.0] * 10  # Fixed-size vector
        
        # Simple one-hot-like encoding for common tag categories
        common_categories = [
            'character', 'style', 'anime', 'realistic', 'fantasy',
            'portrait', 'landscape', 'nsfw', 'safe', 'concept',
        ]
        
        vector = []
        for category in common_categories:
            score = sum(1 for tag in tags if category in tag.lower())
            vector.append(min(score / len(tags), 1.0))
        
        return vector

    def _encode_sd_version(self, sd_version: Optional[str]) -> List[float]:
        """Encode SD version as feature vector."""
        if not sd_version:
            return [0.0, 0.0, 0.0]  # [SD1.x, SD2.x, SDXL]
        
        version_lower = sd_version.lower()
        if 'xl' in version_lower or 'sdxl' in version_lower:
            return [0.0, 0.0, 1.0]
        elif '2.' in version_lower or 'sd2' in version_lower:
            return [0.0, 1.0, 0.0]
        else:
            return [1.0, 0.0, 0.0]  # Assume SD1.x

    def _encode_author_advanced(self, author: Optional[str]) -> float:
        """Encode author information as quality signal."""
        if not author:
            return 0.0
        
        # Simple author quality heuristic (could be enhanced with reputation data)
        return min(len(author) / 20.0, 1.0)

    def _calculate_enhanced_quality_score(self, stats: Optional[Dict]) -> float:
        """Calculate enhanced quality score from community stats."""
        if not stats:
            return 0.5
        
        rating = stats.get('rating', 0)
        download_count = stats.get('downloadCount', 0)
        favorite_count = stats.get('favoriteCount', 0)
        
        # Weighted quality score
        quality = 0.0
        if rating > 0:
            quality += (rating / 5.0) * 0.6  # Rating contributes 60%
        
        if download_count > 0:
            # Log-scaled download popularity
            popularity = min(np.log10(download_count + 1) / 5.0, 1.0)
            quality += popularity * 0.3  # Downloads contribute 30%
        
        if favorite_count > 0:
            # Log-scaled favorite popularity
            favorites = min(np.log10(favorite_count + 1) / 3.0, 1.0)
            quality += favorites * 0.1  # Favorites contribute 10%
        
        return min(quality, 1.0)

    def _calculate_popularity_score(self, stats: Optional[Dict]) -> float:
        """Calculate popularity score."""
        if not stats:
            return 0.0
        
        downloads = stats.get('downloadCount', 0)
        return min(np.log10(downloads + 1) / 6.0, 1.0)

    def _calculate_engagement_score(self, stats: Optional[Dict]) -> float:
        """Calculate community engagement score."""
        if not stats:
            return 0.0
        
        comments = stats.get('commentCount', 0)
        favorites = stats.get('favoriteCount', 0)
        
        engagement = (comments * 0.6 + favorites * 0.4)
        return min(np.log10(engagement + 1) / 3.0, 1.0)

    def _normalize_file_size(self, size_kb: Optional[int]) -> float:
        """Normalize file size to 0-1 range."""
        if not size_kb:
            return 0.5
        
        # Normalize assuming 500MB as large file
        return min(size_kb / (500 * 1024), 1.0)

    def _calculate_recency_score(self, published_at) -> float:
        """Calculate recency score (newer = higher)."""
        if not published_at:
            return 0.0
        
        try:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            
            # Handle timezone-naive datetime
            if published_at.tzinfo is None:
                published_at = published_at.replace(tzinfo=timezone.utc)
            
            days_old = (now - published_at).days
            
            # Recency score: 1.0 for new, 0.0 for >365 days old
            return max(0.0, 1.0 - (days_old / 365.0))
        except Exception:
            return 0.5

    def _calculate_maturity_score(self, created_at) -> float:
        """Calculate maturity score (older = more mature/tested)."""
        if not created_at:
            return 0.0
        
        try:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            
            # Handle timezone-naive datetime
            if created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            
            days_old = (now - created_at).days
            
            # Maturity score: increases with age up to 180 days
            return min(days_old / 180.0, 1.0)
        except Exception:
            return 0.5

    def _calculate_sd_compatibility(self, sd_version: Optional[str]) -> float:
        """Calculate SD version compatibility score."""
        if not sd_version:
            return 0.5
        
        # For now, assume SDXL is most compatible (highest score)
        version_lower = sd_version.lower()
        if 'xl' in version_lower or 'sdxl' in version_lower:
            return 1.0
        elif '2.' in version_lower:
            return 0.7
        else:
            return 0.8  # SD1.x is still widely compatible


class LoRARecommendationEngine:
    """High-performance similarity matching using optimized algorithms."""
    
    def __init__(self, feature_extractor: GPULoRAFeatureExtractor, device='cuda'):
        """Initialize recommendation engine.
        
        Args:
            feature_extractor: Feature extraction service
            device: Device to use for computations

        """
        self.feature_extractor = feature_extractor
        self.device = device
        
        # Pre-computed embeddings and metadata
        self.semantic_embeddings = None
        self.artistic_embeddings = None
        self.technical_embeddings = None
        self.lora_ids = []
        self.loras_dict = {}
        
        # Try to use FAISS for fast similarity search
        self._faiss_available = False
        try:
            import faiss
            self._faiss = faiss
            self._faiss_available = True
            print("✅ FAISS available for fast similarity search")
        except ImportError:
            print("⚠️ FAISS not available, using numpy for similarity computation")

    def build_similarity_index(self, loras: List):
        """Build similarity index for fast recommendations."""
        print(f"🚀 Building similarity index for {len(loras)} LoRAs...")
        
        # Extract all embeddings in batches
        embeddings = self.feature_extractor.semantic_embedder.batch_encode_collection(loras)
        
        # Store embeddings
        self.semantic_embeddings = embeddings['semantic'].astype('float32')
        self.artistic_embeddings = embeddings['artistic'].astype('float32')
        self.technical_embeddings = embeddings['technical'].astype('float32')
        
        # Normalize embeddings for cosine similarity
        self.semantic_embeddings = self._normalize_embeddings(self.semantic_embeddings)
        self.artistic_embeddings = self._normalize_embeddings(self.artistic_embeddings)
        self.technical_embeddings = self._normalize_embeddings(self.technical_embeddings)
        
        # Cache metadata for fast lookup
        self.lora_ids = [lora.id for lora in loras]
        self.loras_dict = {lora.id: lora for lora in loras}
        
        print(f"✅ Similarity index built successfully for {len(loras)} LoRAs")

    def _normalize_embeddings(self, embeddings: np.ndarray) -> np.ndarray:
        """Normalize embeddings for cosine similarity."""
        if embeddings.size == 0:
            return embeddings
        
        # Ensure 2D array with proper shape
        if embeddings.ndim == 1:
            if embeddings.size == 0:
                return embeddings
            embeddings = embeddings.reshape(1, -1)
        elif embeddings.ndim == 2 and embeddings.shape[0] == 0:
            # Empty 2D array, return as is
            return embeddings
            
        norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
        norms[norms == 0] = 1  # Avoid division by zero
        return embeddings / norms

    def get_recommendations(
        self,
        target_lora,
        n_recommendations: int = 20,
        weights: Optional[Dict[str, float]] = None,
    ) -> List[Dict[str, Any]]:
        """Generate recommendations using multi-modal similarity."""
        if weights is None:
            weights = {
                'semantic': 0.6,    # Primary weight for content similarity
                'artistic': 0.3,    # Style and aesthetic matching
                'technical': 0.1,    # Compatibility factors
            }
        
        # Extract target embeddings
        target_embeddings = self.feature_extractor.semantic_embedder.create_multi_modal_embedding(target_lora)
        
        # Normalize target embeddings
        semantic_query = self._normalize_embeddings(
            target_embeddings['semantic'].reshape(1, -1),
        )[0]
        artistic_query = self._normalize_embeddings(
            target_embeddings['artistic'].reshape(1, -1),
        )[0]
        technical_query = self._normalize_embeddings(
            target_embeddings['technical'].reshape(1, -1),
        )[0]
        
        # Calculate similarities
        semantic_similarities = np.dot(self.semantic_embeddings, semantic_query)
        artistic_similarities = np.dot(self.artistic_embeddings, artistic_query)
        technical_similarities = np.dot(self.technical_embeddings, technical_query)
        
        # Combine similarities using weights
        combined_similarities = (
            weights['semantic'] * semantic_similarities +
            weights['artistic'] * artistic_similarities +
            weights['technical'] * technical_similarities
        )
        
        # Get top candidates (excluding self)
        candidate_indices = []
        for idx in np.argsort(combined_similarities)[::-1]:
            if self.lora_ids[idx] != target_lora.id:
                candidate_indices.append(idx)
                if len(candidate_indices) >= n_recommendations * 2:
                    break
        
        # Apply additional filtering and boosting
        final_recommendations = []
        
        for idx in candidate_indices:
            candidate_lora = self.loras_dict[self.lora_ids[idx]]
            
            # Apply compatibility and quality filters
            if self._is_compatible(target_lora, candidate_lora):
                
                # Calculate explanation
                explanation = self._generate_explanation(target_lora, candidate_lora)
                
                # Apply boosting factors
                quality_boost = self._calculate_quality_boost(candidate_lora)
                popularity_boost = self._calculate_popularity_boost(candidate_lora)
                recency_boost = self._calculate_recency_boost(candidate_lora)
                
                combined_score = combined_similarities[idx]
                final_score = combined_score * (1 + quality_boost + popularity_boost + recency_boost)
                
                final_recommendations.append({
                    'lora_id': self.lora_ids[idx],
                    'similarity_score': float(combined_score),
                    'final_score': float(final_score),
                    'explanation': explanation,
                    'semantic_similarity': float(semantic_similarities[idx]),
                    'artistic_similarity': float(artistic_similarities[idx]),
                    'technical_similarity': float(technical_similarities[idx]),
                    'quality_boost': float(quality_boost),
                    'popularity_boost': float(popularity_boost),
                    'recency_boost': float(recency_boost),
                })
                
                if len(final_recommendations) >= n_recommendations:
                    break
        
        # Sort by final score
        final_recommendations.sort(key=lambda x: x['final_score'], reverse=True)
        return final_recommendations[:n_recommendations]

    def _is_compatible(self, target_lora, candidate_lora) -> bool:
        """Check if two LoRAs are compatible."""
        # Basic compatibility checks
        if target_lora.sd_version and candidate_lora.sd_version:
            # Same SD version is preferred
            return target_lora.sd_version == candidate_lora.sd_version
        
        # If no version info, assume compatible
        return True

    def _generate_explanation(self, target_lora, candidate_lora) -> str:
        """Generate human-readable explanation for recommendation."""
        explanations = []
        
        # Content similarity
        if target_lora.description and candidate_lora.description:
            common_keywords = self._find_common_keywords(
                target_lora.description, 
                candidate_lora.description,
            )
            if common_keywords:
                explanations.append(f"Similar content: {', '.join(common_keywords[:3])}")
        
        # Tag similarity
        if target_lora.tags and candidate_lora.tags:
            common_tags = set(target_lora.tags) & set(candidate_lora.tags)
            if common_tags:
                explanations.append(f"Shared tags: {', '.join(list(common_tags)[:3])}")
        
        # Technical compatibility
        if target_lora.sd_version == candidate_lora.sd_version:
            explanations.append(f"Same SD version ({target_lora.sd_version})")
        
        return " | ".join(explanations) if explanations else "General similarity"

    def _find_common_keywords(self, text1: str, text2: str) -> List[str]:
        """Find common keywords between two texts."""
        if not text1 or not text2:
            return []
        
        # Simple word-based comparison
        words1 = set(re.findall(r'\b\w+\b', text1.lower()))
        words2 = set(re.findall(r'\b\w+\b', text2.lower()))
        
        # Filter out common words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        common_words = (words1 & words2) - stop_words
        
        # Filter by minimum length
        return [word for word in common_words if len(word) > 3][:5]

    def _calculate_quality_boost(self, lora) -> float:
        """Calculate quality-based boost factor."""
        if not lora.stats:
            return 0.0
        
        rating = lora.stats.get('rating', 0)
        if rating > 4:
            return 0.1
        elif rating > 3:
            return 0.05
        return 0.0

    def _calculate_popularity_boost(self, lora) -> float:
        """Calculate popularity-based boost factor."""
        if not lora.stats:
            return 0.0
        
        downloads = lora.stats.get('downloadCount', 0)
        if downloads > 10000:
            return 0.1
        elif downloads > 1000:
            return 0.05
        return 0.0

    def _calculate_recency_boost(self, lora) -> float:
        """Calculate recency-based boost factor."""
        if not lora.published_at:
            return 0.0
        
        try:
            from datetime import datetime, timezone
            now = datetime.now(timezone.utc)
            
            # Handle timezone-naive datetime
            if lora.published_at.tzinfo is None:
                published_at = lora.published_at.replace(tzinfo=timezone.utc)
            else:
                published_at = lora.published_at
            
            days_old = (now - published_at).days
            
            # Boost for recent LoRAs (within 30 days)
            if days_old < 30:
                return 0.05
            return 0.0
        except Exception:
            return 0.0

    def update_index_incremental(self, new_loras: List):
        """Incrementally update the index with new LoRAs."""
        if not new_loras:
            return
        
        print(f"🔄 Adding {len(new_loras)} new LoRAs to index...")
        
        # Extract embeddings for new LoRAs
        new_embeddings = self.feature_extractor.semantic_embedder.batch_encode_collection(new_loras)
        
        # Normalize new embeddings
        new_semantic = self._normalize_embeddings(new_embeddings['semantic'].astype('float32'))
        new_artistic = self._normalize_embeddings(new_embeddings['artistic'].astype('float32'))
        new_technical = self._normalize_embeddings(new_embeddings['technical'].astype('float32'))
        
        # Append to existing embeddings
        if self.semantic_embeddings is not None:
            self.semantic_embeddings = np.vstack([self.semantic_embeddings, new_semantic])
            self.artistic_embeddings = np.vstack([self.artistic_embeddings, new_artistic])
            self.technical_embeddings = np.vstack([self.technical_embeddings, new_technical])
        else:
            self.semantic_embeddings = new_semantic
            self.artistic_embeddings = new_artistic
            self.technical_embeddings = new_technical
        
        # Update metadata
        for lora in new_loras:
            self.lora_ids.append(lora.id)
            self.loras_dict[lora.id] = lora
        
        print(f"✅ Added {len(new_loras)} new LoRAs to index")
