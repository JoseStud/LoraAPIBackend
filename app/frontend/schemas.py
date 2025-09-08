from pydantic import BaseModel, Field


class SimilarityForm(BaseModel):
    lora_id: str = Field(..., min_length=1)
    semantic_weight: float = Field(0.4, ge=0.0, le=1.0)
    artistic_weight: float = Field(0.3, ge=0.0, le=1.0)
    technical_weight: float = Field(0.3, ge=0.0, le=1.0)
    limit: int = Field(10, ge=1, le=100)
    threshold: float = Field(0.1, ge=0.0, le=1.0)


class PromptForm(BaseModel):
    prompt: str = Field(..., min_length=1)
    semantic_weight: float = Field(0.4, ge=0.0, le=1.0)
    style_weight: float = Field(0.3, ge=0.0, le=1.0)
    context_weight: float = Field(0.3, ge=0.0, le=1.0)
    limit: int = Field(10, ge=1, le=100)
