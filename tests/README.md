# Testing Guide - Comprehensive Quality Assurance Strategy

This document provides a complete overview of the testing strategy, organization, and execution for the LoRA Manager project, including recent architectural improvements and quality metrics.

## 📊 Testing Overview

**Quality Status**: 🟢 **Comprehensive Coverage**  
The project implements sophisticated testing across multiple layers with ongoing organization improvements based on architectural complexity analysis.

**Key Metrics**:
- **Backend Coverage**: Python with pytest, comprehensive service testing
- **Frontend Coverage**: TypeScript with Vitest, Vue component testing  
- **Integration Testing**: API and workflow validation
- **E2E Testing**: Playwright browser automation
- **Performance Testing**: Lighthouse CI integration

**Recent Improvements**:
- ✅ Vue component test organization (tests/vue/)
- ✅ Specialized test modules for composables and stores
- ✅ Integration test separation from unit tests
- 🔄 **Current Focus**: Large test file refactoring (608+ line files → focused modules)

## 🏗️ Testing Architecture

## 🏗️ Advanced Test Organization

The testing architecture reflects modern best practices with specialized test modules and clear separation of concerns:

```
tests/
├── unit/                    # Focused unit tests (<200 lines each)
│   ├── python/             # Backend service unit tests
│   │   ├── test_recommendation_components.py  # AI service testing
│   │   └── test_schemas.py                    # Pydantic model validation
│   ├── test_generationModules.spec.ts        # Generation logic testing
│   ├── test_generationStore.spec.ts          # Pinia store testing
│   └── test_jobStatus.spec.ts                # Status management testing
│
├── vue/                     # Vue-specific component testing
│   ├── PromptComposerActions.spec.ts         # Component interaction testing
│   ├── PromptComposerAvailableList.spec.ts   # List component testing
│   ├── PromptComposerComposition.spec.ts     # Composition logic testing
│   ├── progressUtils.spec.ts                 # Utility function testing
│   ├── useJobQueue.spec.ts                   # Complex composable testing
│   └── usePromptComposition.spec.ts          # State management testing
│
├── integration/             # Multi-service integration testing
│   ├── api.test.js          # REST API integration
│   ├── database.test.js     # Database workflow testing
│   └── test_main.py         # Application integration testing
│
├── e2e/                     # End-to-end workflow testing
│   ├── lora-manager.spec.js # Complete user workflows
│   └── workflows.spec.js    # Complex business process testing
│
├── performance/             # Performance and load testing
│   └── performance.spec.js  # Lighthouse CI integration
│
├── reports/                 # Coverage and quality reports
├── mocks/                   # Comprehensive mocking infrastructure
│   └── api-mocks.js         # API response mocking
└── conftest.py              # Shared pytest fixtures and configuration
```

### Test Organization Improvements

**Recent Refactoring** (addressing complexity analysis findings):
- **Component Tests**: Extracted focused Vue component tests from large files
- **Composable Tests**: Specialized testing for complex composables like `useJobQueue`
- **Service Tests**: Organized backend services into focused test modules
- **Integration Tests**: Clear separation between unit and integration concerns

**Quality Standards**:
- **File Size Limit**: <200 lines per test module
- **Single Responsibility**: Each test file focuses on one component/service
- **Comprehensive Mocking**: Isolated testing with controlled dependencies
- **Performance Monitoring**: Lighthouse integration for web performance metrics

## 🚀 Running Tests - Comprehensive Execution Guide

### Development Workflow (Recommended)

**Quick Quality Check:**
```bash
# Install all dependencies first
pip install -r requirements.txt -r dev-requirements.txt
PUPPETEER_SKIP_DOWNLOAD=true npm install

# Run focused test suites (fast, for active development)
pytest tests/test_services.py -v          # Core service testing
npm run test:unit                         # Vue component testing
```

**Full Quality Validation:**
```bash
# Complete test suite execution
npm run validate                          # Runs linting + tests
pytest tests/ -v --cov=backend           # Backend with coverage
npm run test:integration                  # API integration tests
npm run test:e2e                         # End-to-end workflows
```

### Backend Testing (Python/Pytest)

**Service Layer Testing:**
```bash
# Core service testing (recommended for development)
pytest tests/test_services.py -v                    # Service architecture (518 lines)
pytest tests/test_main.py -v                       # Application integration (451 lines)

# Specialized service testing  
pytest tests/unit/python/test_recommendation_components.py -v  # AI/ML components
pytest tests/unit/python/test_schemas.py -v                    # Pydantic validation

# Advanced features (require dependencies)
pytest tests/test_recommendations.py -v            # AI recommendations (608 lines - being refactored)
pytest tests/test_generation_jobs.py -v           # Background job processing
```

**Test Execution Options:**
```bash
# Coverage reporting
pytest --cov=backend --cov-report=html --cov-report=term

# Specific test patterns
pytest -k "test_adapter" -v               # Run adapter-related tests
pytest -k "test_recommendation" -v        # Run recommendation tests
pytest -x                                 # Stop on first failure

# Performance profiling
pytest --profile                          # Performance analysis
pytest --benchmark-only                   # Benchmark tests only
```

### Frontend Testing (TypeScript/Vitest)

**Component and Composable Testing:**
```bash
# Vue component testing (recommended for frontend development)
npm run test:unit                          # All component and composable tests

# Specialized frontend testing
npm run test:vue                           # Vue-specific component tests
npm run test:integration                   # API integration tests
npm run test:watch                         # Watch mode for active development
```

**Advanced Frontend Testing:**
```bash
# Performance and quality testing
npm run test:performance                   # Lighthouse CI (requires Chrome)
npm run test:coverage                      # Coverage reporting with Coveralls

# Specific test patterns
npm test -- --run test/vue/               # Run Vue tests only  
npm test -- --run test/unit/              # Run unit tests only
npm test -- --reporter=verbose            # Detailed test output
```

### End-to-End Testing (Playwright)

**Complete Workflow Testing:**
```bash
# Full E2E testing (requires application running)
npm run test:e2e                          # Complete user workflows

# Development E2E testing
npx playwright test --headed              # Watch browser interactions
npx playwright test --debug               # Debug mode with step-through
npx playwright test --ui                  # Interactive test runner

# Specific workflow testing
npx playwright test tests/e2e/lora-manager.spec.js  # LoRA management workflows
npx playwright test tests/e2e/workflows.spec.js     # Complex business processes
```

**Browser and Device Testing:**
```bash
# Cross-browser testing
npx playwright test --project=chromium    # Chrome testing
npx playwright test --project=firefox     # Firefox testing  
npx playwright test --project=webkit      # Safari testing

# Mobile device simulation
npx playwright test --project=mobile      # Mobile workflows
```

## 🛠️ Advanced Testing Infrastructure

### Mocking and Test Environment

**Backend Test Environment:**
```python
# Sophisticated fixture setup in conftest.py
from unittest.mock import Mock

from backend.services import get_service_container_builder

@pytest.fixture
def service_registry_with_mocks(db_session):
    """Typed service registry with mocked dependencies for isolated testing"""
    builder = get_service_container_builder()
    return builder.build(
        db_session,
        recommendation_gpu_available=False,  # CPU testing mode
        queue_orchestrator=Mock(spec=QueueOrchestrator),
        analytics_repository=Mock(spec=AnalyticsRepository),
    )

@pytest.fixture
def test_database():
    """Isolated test database for integration testing"""
    # SQLite in-memory database for fast test execution
```

**Frontend Test Environment:**
```typescript
// Comprehensive mocking in tests/mocks/api-mocks.js
export const mockApiResponses = {
  '/api/v1/adapters': { data: mockAdapters },
  '/api/v1/generation': { data: mockGenerationResults },
  '/api/v1/recommendations': { data: mockRecommendations }
}

// Pinia store testing with createTestingPinia()
const wrapper = mount(Component, {
  global: {
    plugins: [createTestingPinia({
      initialState: { generation: mockState }
    })]
  }
})
```

**WebSocket Testing:**
```typescript
// Mock WebSocket for real-time feature testing
class MockWebSocket {
  constructor(url: string) {
    this.url = url
    this.readyState = WebSocket.CONNECTING
  }
  
  send(data: string) {
    // Simulate server responses for testing
  }
}
```

### Performance and Quality Monitoring

**Test Performance Optimization:**
```bash
# Parallel test execution
pytest -n auto                            # Parallel pytest execution
npm test -- --reporter=min               # Minimal output for CI

# Test performance profiling
pytest --durations=10                     # Show slowest tests
npm test -- --reporter=verbose --coverage # Detailed coverage reporting
```

**Quality Gates:**
```bash
# Code quality integration
npm run lint                              # ESLint + Prettier
ruff check .                              # Python linting
npm run type-check                        # TypeScript validation

# Coverage requirements
pytest --cov-fail-under=85               # Minimum 85% backend coverage
npm test -- --coverage.threshold=85      # Frontend coverage threshold
```

### CI/CD Integration

**GitHub Actions Integration:**
```yaml
# .github/workflows/test.yml (conceptual)
- name: Run Python Tests
  run: |
    pytest --cov=backend --cov-report=xml
    
- name: Run Frontend Tests  
  run: |
    npm run test:unit
    npm run test:integration
    
- name: E2E Testing
  run: |
    npm run build
    npm run test:e2e
```

**Quality Reporting:**
```bash
# Coverage reporting
pytest --cov-report=html                  # HTML coverage reports
npm run test:coverage                     # Coveralls integration

# Performance monitoring
npm run test:performance                  # Lighthouse CI integration
```

---

## 📚 Testing Best Practices

### Service Testing Patterns

**Dependency Injection Testing:**
```python
def test_recommendation_service_with_mocked_dependencies():
    # Arrange
    mock_repository = Mock(spec=RecommendationRepository)
    mock_repository.find_similar_loras.return_value = [mock_lora]
    
    service = RecommendationService(
        db_session=mock_session,
        repository=mock_repository
    )
    
    # Act
    recommendations = service.get_similar_loras("prompt")
    
    # Assert
    assert len(recommendations) == 1
    mock_repository.find_similar_loras.assert_called_once_with("prompt")
```

**Complex Service Workflow Testing:**
```python
@pytest.mark.asyncio
async def test_generation_coordinator_workflow():
    # Test complete generation workflow with multiple services
    coordinator = GenerationCoordinator(
        delivery_service=mock_delivery,
        websocket_service=mock_websocket,
        generation_service=mock_generation
    )
    
    result = await coordinator.process_generation_request(request)
    
    # Verify service coordination
    assert mock_delivery.enqueue_job.called
    assert mock_websocket.broadcast_status.called
```

### Component Testing Patterns

**Vue Component Testing with Props and Events:**
```typescript
describe('GenerationHistoryHeader', () => {
  it('should emit view mode changes correctly', async () => {
    const wrapper = mount(GenerationHistoryHeader, {
      props: { 
        viewMode: 'grid',
        sortOptions: mockSortOptions
      }
    })
    
    await wrapper.find('[data-test="list-view-btn"]').trigger('click')
    
    expect(wrapper.emitted('update:viewMode')).toEqual([['list']])
  })
  
  it('should handle sort changes with proper event payload', async () => {
    // Test component event handling and prop updates
  })
})
```

**Composable Testing:**
```typescript
describe('useJobQueue', () => {
  it('should manage polling state correctly', () => {
    const { isPolling, startPolling, stopPolling } = useJobQueue({
      pollInterval: ref(1000),
      disabled: ref(false)
    })
    
    expect(isPolling.value).toBe(false)
    
    startPolling()
    expect(isPolling.value).toBe(true)
    
    stopPolling()
    expect(isPolling.value).toBe(false)
  })
})
```

### E2E Testing Patterns

**Complete User Workflow Testing:**
```javascript
test('should complete LoRA management workflow', async ({ page }) => {
  // Navigate to LoRA management
  await page.goto('/loras')
  
  // Upload new LoRA
  await page.click('[data-test="upload-btn"]')
  await page.setInputFiles('[data-test="file-input"]', 'test-lora.safetensors')
  
  // Verify upload and metadata
  await expect(page.locator('[data-test="lora-item"]')).toContainText('test-lora')
  
  // Test recommendation workflow
  await page.click('[data-test="get-recommendations"]')
  await expect(page.locator('[data-test="recommendations"]')).toBeVisible()
})
```

---

## 🎯 Current Testing Priorities

### Immediate Focus (Based on Complexity Analysis)

1. **Large Test File Refactoring**
   - Split `test_recommendations.py` (608 lines) into focused modules
   - Organize `test_services.py` (518 lines) by service type
   - Target: <200 lines per test module

2. **Component Test Enhancement**
   - Complete Vue component test coverage
   - Add integration tests for complex composables
   - Improve test isolation and performance

3. **Performance Test Integration**
   - Enhance Lighthouse CI integration
   - Add backend performance benchmarking
   - Monitor test execution performance

### Quality Metrics Targets

- **Coverage**: >85% across backend and frontend
- **Test Performance**: <30 seconds for unit test suites  
- **File Organization**: <200 lines per test module
- **Isolation**: Zero test interdependencies

For detailed architectural context, see [Architectural Complexity Analysis](../ARCHITECTURAL_COMPLEXITY_ANALYSIS.md).
