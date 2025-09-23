"""Composition service for LoRA prompt formatting."""

from dataclasses import dataclass
from typing import TYPE_CHECKING, List

from backend.models.adapters import Adapter

if TYPE_CHECKING:  # pragma: no cover - import used for type hints only
    from backend.services.adapters import AdapterService


@dataclass
class CompositionResult:
    """Structured result returned when composing prompts."""

    prompt: str
    tokens: List[str]
    warnings: List[str]


class ComposeService:
    """Service for prompt composition."""

    def __init__(self):
        """Initialize ComposeService."""
        pass

    def format_token(self, name: str, weight: float) -> str:
        """Format a lora token string for composition.
        
        Args:
            name: LoRA name
            weight: LoRA weight
            
        Returns:
            Formatted token string

        """
        return f"<lora:{name}:{weight:.3f}>"

    def compose_prompt(
        self, 
        adapters: List[Adapter], 
        prefix: str = "", 
        suffix: str = "",
    ) -> tuple[str, List[str]]:
        """Compose a prompt from active adapters with prefix/suffix.
        
        Args:
            adapters: List of active adapters
            prefix: Optional prefix text
            suffix: Optional suffix text
            
        Returns:
            Tuple of (full_prompt, tokens_list)

        """
        tokens = []
        for adapter in adapters:
            token = self.format_token(adapter.name, adapter.weight)
            tokens.append(token)
        
        # Build prompt components
        components = []
        if prefix.strip():
            components.append(prefix.strip())
        
        if tokens:
            components.extend(tokens)
        
        if suffix.strip():
            components.append(suffix.strip())

        full_prompt = " ".join(components)
        return full_prompt, tokens

    def compose_from_adapter_service(
        self,
        adapter_service: "AdapterService",
        *,
        prefix: str = "",
        suffix: str = "",
    ) -> CompositionResult:
        """Compose a prompt using adapters provided by the service.

        Args:
            adapter_service: Adapter service used to fetch active adapters.
            prefix: Optional prefix text to include.
            suffix: Optional suffix text to include.

        Returns:
            CompositionResult containing the composed prompt, tokens, and warnings.

        """
        adapters = adapter_service.list_active_ordered()
        warnings = self.validate_adapters(adapters)
        prompt, tokens = self.compose_prompt(adapters, prefix or "", suffix or "")
        return CompositionResult(prompt=prompt, tokens=tokens, warnings=warnings)

    def validate_adapters(self, adapters: List[Adapter]) -> List[str]:
        """Validate adapters for composition and return any warnings.
        
        Args:
            adapters: List of adapters to validate
            
        Returns:
            List of warning messages

        """
        warnings = []
        
        if not adapters:
            warnings.append("No active adapters found for composition")
        
        # Check for duplicate names
        names = [adapter.name for adapter in adapters]
        seen = set()
        duplicate_set = set()
        duplicates: List[str] = []

        for name in names:
            if name in seen:
                if name not in duplicate_set:
                    duplicate_set.add(name)
                    duplicates.append(name)
            else:
                seen.add(name)

        if duplicates:
            warnings.append(f"Duplicate adapter names found: {', '.join(duplicates)}")
        
        # Check for missing weights
        zero_weights = [adapter.name for adapter in adapters if adapter.weight == 0]
        if zero_weights:
            warnings.append(f"Adapters with zero weight: {', '.join(zero_weights)}")
        
        return warnings

    def get_composition_stats(self, adapters: List[Adapter]) -> dict:
        """Get statistics about the composition.
        
        Args:
            adapters: List of adapters in composition
            
        Returns:
            Dict with composition statistics

        """
        if not adapters:
            return {
                "total_adapters": 0,
                "total_weight": 0.0,
                "average_weight": 0.0,
                "unique_names": 0,
            }
        
        weights = [adapter.weight for adapter in adapters]
        names = set(adapter.name for adapter in adapters)
        
        return {
            "total_adapters": len(adapters),
            "total_weight": sum(weights),
            "average_weight": sum(weights) / len(weights),
            "unique_names": len(names),
            "weight_range": (min(weights), max(weights)) if weights else (0, 0),
        }
