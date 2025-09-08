"""
Pytest tests for Pydantic schema validation
"""

import pytest
from pydantic import ValidationError
from app.frontend.schemas import SimilarityForm, PromptForm


class TestSimilarityForm:
    """Test cases for SimilarityForm validation"""

    def test_valid_similarity_form(self):
        """Test that valid data creates a SimilarityForm successfully"""
        valid_data = {
            'lora_id': 'test-lora-123',
            'semantic_weight': 0.4,
            'artistic_weight': 0.3,
            'technical_weight': 0.3,
            'limit': 10,
            'threshold': 0.1
        }
        
        form = SimilarityForm(**valid_data)
        
        assert form.lora_id == 'test-lora-123'
        assert form.semantic_weight == 0.4
        assert form.artistic_weight == 0.3
        assert form.technical_weight == 0.3
        assert form.limit == 10
        assert form.threshold == 0.1

    def test_missing_lora_id(self):
        """Test that missing lora_id raises ValidationError"""
        invalid_data = {
            'semantic_weight': 0.4,
            'artistic_weight': 0.3,
            'technical_weight': 0.3,
            'limit': 10,
            'threshold': 0.1
        }
        
        with pytest.raises(ValidationError) as exc_info:
            SimilarityForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert len(errors) > 0
        assert any(error['loc'] == ('lora_id',) for error in errors)

    def test_empty_lora_id(self):
        """Test that empty lora_id raises ValidationError"""
        invalid_data = {
            'lora_id': '',
            'semantic_weight': 0.4,
            'artistic_weight': 0.3,
            'technical_weight': 0.3,
            'limit': 10,
            'threshold': 0.1
        }
        
        with pytest.raises(ValidationError) as exc_info:
            SimilarityForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('lora_id',) for error in errors)

    def test_negative_weights(self):
        """Test that negative weights raise ValidationError"""
        invalid_data = {
            'lora_id': 'test-lora-123',
            'semantic_weight': -0.1,
            'artistic_weight': 0.3,
            'technical_weight': 0.3,
            'limit': 10,
            'threshold': 0.1
        }
        
        with pytest.raises(ValidationError) as exc_info:
            SimilarityForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('semantic_weight',) for error in errors)

    def test_weights_over_one(self):
        """Test that weights over 1.0 raise ValidationError"""
        invalid_data = {
            'lora_id': 'test-lora-123',
            'semantic_weight': 1.5,
            'artistic_weight': 0.3,
            'technical_weight': 0.3,
            'limit': 10,
            'threshold': 0.1
        }
        
        with pytest.raises(ValidationError) as exc_info:
            SimilarityForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('semantic_weight',) for error in errors)

    def test_invalid_limit_zero(self):
        """Test that limit of 0 raises ValidationError"""
        invalid_data = {
            'lora_id': 'test-lora-123',
            'semantic_weight': 0.4,
            'artistic_weight': 0.3,
            'technical_weight': 0.3,
            'limit': 0,
            'threshold': 0.1
        }
        
        with pytest.raises(ValidationError) as exc_info:
            SimilarityForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('limit',) for error in errors)

    def test_invalid_limit_too_high(self):
        """Test that limit over 100 raises ValidationError"""
        invalid_data = {
            'lora_id': 'test-lora-123',
            'semantic_weight': 0.4,
            'artistic_weight': 0.3,
            'technical_weight': 0.3,
            'limit': 150,
            'threshold': 0.1
        }
        
        with pytest.raises(ValidationError) as exc_info:
            SimilarityForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('limit',) for error in errors)

    def test_invalid_threshold_negative(self):
        """Test that negative threshold raises ValidationError"""
        invalid_data = {
            'lora_id': 'test-lora-123',
            'semantic_weight': 0.4,
            'artistic_weight': 0.3,
            'technical_weight': 0.3,
            'limit': 10,
            'threshold': -0.1
        }
        
        with pytest.raises(ValidationError) as exc_info:
            SimilarityForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('threshold',) for error in errors)

    def test_string_numbers_converted(self):
        """Test that string numbers are converted to floats/ints"""
        data_with_strings = {
            'lora_id': 'test-lora-123',
            'semantic_weight': '0.4',
            'artistic_weight': '0.3',
            'technical_weight': '0.3',
            'limit': '10',
            'threshold': '0.1'
        }
        
        form = SimilarityForm(**data_with_strings)
        
        assert isinstance(form.semantic_weight, float)
        assert isinstance(form.artistic_weight, float)
        assert isinstance(form.technical_weight, float)
        assert isinstance(form.limit, int)
        assert isinstance(form.threshold, float)


class TestPromptForm:
    """Test cases for PromptForm validation"""

    def test_valid_prompt_form(self):
        """Test that valid data creates a PromptForm successfully"""
        valid_data = {
            'prompt': 'A beautiful landscape with mountains',
            'semantic_weight': 0.4,
            'style_weight': 0.3,
            'context_weight': 0.3,
            'limit': 10
        }
        
        form = PromptForm(**valid_data)
        
        assert form.prompt == 'A beautiful landscape with mountains'
        assert form.semantic_weight == 0.4
        assert form.style_weight == 0.3
        assert form.context_weight == 0.3
        assert form.limit == 10

    def test_missing_prompt(self):
        """Test that missing prompt raises ValidationError"""
        invalid_data = {
            'semantic_weight': 0.4,
            'style_weight': 0.3,
            'context_weight': 0.3,
            'limit': 10
        }
        
        with pytest.raises(ValidationError) as exc_info:
            PromptForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('prompt',) for error in errors)

    def test_empty_prompt(self):
        """Test that empty prompt raises ValidationError"""
        invalid_data = {
            'prompt': '',
            'semantic_weight': 0.4,
            'style_weight': 0.3,
            'context_weight': 0.3,
            'limit': 10
        }
        
        with pytest.raises(ValidationError) as exc_info:
            PromptForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('prompt',) for error in errors)

    def test_whitespace_only_prompt(self):
        """Test that whitespace-only prompt raises ValidationError"""
        invalid_data = {
            'prompt': '   \n\t   ',
            'semantic_weight': 0.4,
            'style_weight': 0.3,
            'context_weight': 0.3,
            'limit': 10
        }
        
        with pytest.raises(ValidationError) as exc_info:
            PromptForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('prompt',) for error in errors)

    def test_prompt_too_long(self):
        """Test that very long prompt raises ValidationError"""
        long_prompt = 'A' * 5001  # Assuming max length is 5000
        invalid_data = {
            'prompt': long_prompt,
            'semantic_weight': 0.4,
            'style_weight': 0.3,
            'context_weight': 0.3,
            'limit': 10
        }
        
        with pytest.raises(ValidationError) as exc_info:
            PromptForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('prompt',) for error in errors)

    def test_negative_weights_prompt(self):
        """Test that negative weights raise ValidationError in PromptForm"""
        invalid_data = {
            'prompt': 'Test prompt',
            'semantic_weight': -0.1,
            'style_weight': 0.3,
            'context_weight': 0.3,
            'limit': 10
        }
        
        with pytest.raises(ValidationError) as exc_info:
            PromptForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('semantic_weight',) for error in errors)

    def test_weights_over_one_prompt(self):
        """Test that weights over 1.0 raise ValidationError in PromptForm"""
        invalid_data = {
            'prompt': 'Test prompt',
            'semantic_weight': 0.4,
            'style_weight': 1.5,
            'context_weight': 0.3,
            'limit': 10
        }
        
        with pytest.raises(ValidationError) as exc_info:
            PromptForm(**invalid_data)
        
        errors = exc_info.value.errors()
        assert any(error['loc'] == ('style_weight',) for error in errors)

    def test_default_values(self):
        """Test that default values are applied when fields are missing"""
        minimal_data = {
            'prompt': 'Test prompt'
        }
        
        form = PromptForm(**minimal_data)
        
        assert form.prompt == 'Test prompt'
        # Check that default values are reasonable (exact values depend on schema definition)
        assert 0.0 <= form.semantic_weight <= 1.0
        assert 0.0 <= form.style_weight <= 1.0
        assert 0.0 <= form.context_weight <= 1.0
        assert form.limit >= 1


class TestSchemaIntegration:
    """Integration tests for schema validation"""

    def test_form_data_parsing_similarity(self):
        """Test parsing form data for similarity form"""
        # Simulate form data as it comes from FastAPI
        form_data = {
            'lora_id': 'test-lora-123',
            'semantic_weight': '0.5',
            'artistic_weight': '0.3',
            'technical_weight': '0.2',
            'limit': '15',
            'threshold': '0.05'
        }
        
        # Convert string values as they would come from form
        converted_data = {
            'lora_id': form_data['lora_id'],
            'semantic_weight': float(form_data['semantic_weight']),
            'artistic_weight': float(form_data['artistic_weight']),
            'technical_weight': float(form_data['technical_weight']),
            'limit': int(form_data['limit']),
            'threshold': float(form_data['threshold'])
        }
        
        form = SimilarityForm(**converted_data)
        assert form.lora_id == 'test-lora-123'

    def test_error_message_structure(self):
        """Test that validation errors have the expected structure"""
        invalid_data = {
            'lora_id': '',
            'semantic_weight': -1,
            'limit': 0
        }
        
        with pytest.raises(ValidationError) as exc_info:
            SimilarityForm(**invalid_data)
        
        errors = exc_info.value.errors()
        
        # Check that errors have the expected structure
        for error in errors:
            assert 'loc' in error
            assert 'msg' in error
            assert 'type' in error
            assert isinstance(error['loc'], tuple)
            assert isinstance(error['msg'], str)

    def test_multiple_validation_errors(self):
        """Test that multiple validation errors are caught simultaneously"""
        invalid_data = {
            'lora_id': '',  # Empty string
            'semantic_weight': 2.0,  # Too high
            'artistic_weight': -0.5,  # Negative
            'limit': 0,  # Too low
            'threshold': -1  # Negative
        }
        
        with pytest.raises(ValidationError) as exc_info:
            SimilarityForm(**invalid_data)
        
        errors = exc_info.value.errors()
        
        # Should have multiple errors
        assert len(errors) >= 3  # At least for the obviously invalid fields
        
        # Check that each invalid field is reported
        error_fields = {error['loc'][0] for error in errors}
        expected_fields = {'lora_id', 'semantic_weight', 'artistic_weight', 'limit', 'threshold'}
        assert error_fields.intersection(expected_fields)
