import { describe, it, expect } from 'vitest';

import { createResultsModule, MAX_RESULTS } from '@/features/generation/stores/orchestrator/resultsModule';

const createResult = (overrides: Partial<any> = {}) => ({
  id: overrides.id ?? 'result-1',
  created_at: overrides.created_at,
  prompt: 'prompt',
  image_url: null,
  ...overrides,
});

describe('resultsModule', () => {
  it('sanitizes results via schema and enforces limits', () => {
    const results = createResultsModule();

    results.setResults([
      createResult({ id: 'a' }),
      createResult({ id: 'b', created_at: undefined }),
    ] as any);

    expect(results.results.value).toHaveLength(2);
    expect(results.results.value[1]?.created_at).toMatch(/\d{4}-\d{2}-\d{2}/);

    results.setHistoryLimit(1);
    expect(results.historyLimit.value).toBe(1);
    expect(results.results.value).toHaveLength(1);

    const bulk = Array.from({ length: MAX_RESULTS + 5 }, (_, index) => createResult({ id: `bulk-${index}` }));
    results.setHistoryLimit(MAX_RESULTS + 10);
    results.setResults(bulk as any);
    expect(results.results.value).toHaveLength(MAX_RESULTS);
  });

});
