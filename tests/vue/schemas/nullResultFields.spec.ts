import { describe, expect, it } from 'vitest';

import { parseHistoryListPayload } from '@/features/history/services/historySchemas';
import { GenerationResultSchema } from '@/schemas/generation';

// Shape the backend returns for a finished job without image settings.
const backendResult = {
  id: 'r1',
  job_id: 'r1',
  prompt: 'hello',
  negative_prompt: null,
  status: 'completed',
  image_url: null,
  thumbnail_url: null,
  width: null,
  height: null,
  steps: null,
  cfg_scale: null,
  seed: null,
  created_at: '2026-10-13T21:34:45.071680',
  finished_at: '2026-10-13T21:34:45.098660',
  generation_info: null,
  rating: null,
  is_favorite: false,
};

describe('result schemas accept null image settings', () => {
  it('parses a history list with null width, height, steps and cfg_scale', () => {
    const payload = parseHistoryListPayload([backendResult]);
    const [result] = Array.isArray(payload) ? payload : (payload?.results ?? []);
    expect(result.id).toBe('r1');
    expect(result.width).toBeUndefined();
    expect(result.cfg_scale).toBeUndefined();
  });

  it('parses a recent generation result with the same fields', () => {
    const result = GenerationResultSchema.parse(backendResult);
    expect(result.steps).toBeUndefined();
    expect(result.height).toBeUndefined();
  });
});
