import { describe, expect, it, vi } from 'vitest';

import {
  ensureArray,
  parseGenerationJobStatuses,
  parseGenerationResults,
} from '@/features/generation/services/validation';
import type { GenerationJobStatus, GenerationResult } from '@/types';

const iso = '2024-01-01T00:00:00Z';

describe('generation validation helpers', () => {
  describe('ensureArray', () => {
    it('returns the original array when the input is already an array', () => {
      const original = [1, 2, 3];
      expect(ensureArray(original)).toBe(original);
    });

    it('returns an empty array when the input is not an array', () => {
      expect(ensureArray('hello')).toEqual([]);
      expect(ensureArray(null)).toEqual([]);
    });
  });

  describe('parseGenerationJobStatuses', () => {
    it('filters invalid job status entries and logs validation issues', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const valid: GenerationJobStatus = {
        id: 'job-1',
        jobId: null,
        prompt: null,
        name: null,
        status: 'processing',
        progress: 0.25,
        message: null,
        error: null,
        params: null,
        created_at: iso,
        startTime: null,
        finished_at: null,
        result: null,
      };
      const invalid = { ...valid, id: undefined } as unknown;

      const parsed = parseGenerationJobStatuses([valid, invalid], 'test job');

      expect(parsed).toEqual([valid]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('test job #1');

      warnSpy.mockRestore();
    });
  });

  describe('parseGenerationResults', () => {
    it('filters invalid generation results and logs validation issues', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const valid: GenerationResult = {
        id: 'result-1',
        job_id: 'job-1',
        prompt: 'prompt',
        negative_prompt: null,
        image_url: null,
        thumbnail_url: null,
        seed: null,
        created_at: iso,
        finished_at: null,
        generation_info: null,
      };
      const invalid = { ...valid, id: null } as unknown;

      const parsed = parseGenerationResults([valid, invalid], 'test result');

      expect(parsed).toEqual([valid]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain('test result #1');

      warnSpy.mockRestore();
    });
  });
});
