from pydantic import BaseModel, Field, field_validator


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

    @field_validator("prompt", mode="before")
    @classmethod
    def _validate_prompt(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("prompt must be a string")
        s = v.strip()
        if not s:
            raise ValueError("prompt must not be empty")
        if len(s) > 5000:
            raise ValueError("prompt too long")
        return s
