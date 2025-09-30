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

  it('creates result payloads from completion messages', () => {
    const results = createResultsModule();
    const now = new Date().toISOString();

    const completion = {
      job_id: 'job-1',
      result_id: 'result-1',
      prompt: 'hello',
      created_at: now,
      width: 512,
      height: 512,
      steps: 30,
      cfg_scale: 7,
      images: ['image-url'],
    } as any;

    const normalized = results.createResultFromCompletion(completion);
    expect(normalized.image_url).toBe('image-url');
    expect(normalized.created_at).toBe(now);
    expect(normalized.id).toBe('result-1');
  });
});
