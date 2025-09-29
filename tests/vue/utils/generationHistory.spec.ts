import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  mapGenerationResultsToHistory,
  mapHistoryResultsToGeneration,
  toGenerationResult,
  toHistoryResult,
} from '@/utils/generationHistory';
import type { GenerationHistoryResult, GenerationResult } from '@/types';

describe('generationHistory utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('converts a generation result to a history result with defaults', () => {
    const result: GenerationResult = {
      id: 'test-id',
    };

    const history = toHistoryResult(result);

    expect(history).toMatchObject({
      id: 'test-id',
      prompt: null,
      negative_prompt: null,
      status: null,
      image_url: null,
      thumbnail_url: null,
      finished_at: null,
      width: null,
      height: null,
      steps: null,
      cfg_scale: null,
      seed: null,
      generation_info: null,
    });
    expect(history.job_id).toBeUndefined();
    expect(history.created_at).toBe('2024-01-01T00:00:00.000Z');
  });

  it('preserves populated fields when converting to a history result', () => {
    const result: GenerationResult = {
      id: 'another-id',
      job_id: 'job-123',
      prompt: 'Hello world',
      negative_prompt: 'No artifacts',
      status: 'completed',
      image_url: 'https://example.com/image.png',
      thumbnail_url: 'https://example.com/thumb.png',
      width: 512,
      height: 768,
      steps: 25,
      cfg_scale: 7,
      seed: 42,
      created_at: '2023-12-31T23:00:00.000Z',
      finished_at: '2023-12-31T23:05:00.000Z',
      generation_info: { source: 'test' },
    };

    const history = toHistoryResult(result);

    expect(history).toMatchObject({
      id: 'another-id',
      job_id: 'job-123',
      prompt: 'Hello world',
      negative_prompt: 'No artifacts',
      status: 'completed',
      image_url: 'https://example.com/image.png',
      thumbnail_url: 'https://example.com/thumb.png',
      width: 512,
      height: 768,
      steps: 25,
      cfg_scale: 7,
      seed: 42,
      created_at: '2023-12-31T23:00:00.000Z',
      finished_at: '2023-12-31T23:05:00.000Z',
      generation_info: { source: 'test' },
    });
  });

  it('converts a history result back into a generation result', () => {
    const history: GenerationHistoryResult = {
      id: 'history-id',
      job_id: 'job-999',
      prompt: null,
      negative_prompt: null,
      status: 'completed',
      image_url: null,
      thumbnail_url: null,
      created_at: '2024-01-02T10:00:00.000Z',
      finished_at: null,
      width: 640,
      height: 640,
      steps: 30,
      cfg_scale: 10,
      seed: 1234,
      generation_info: { foo: 'bar' },
    };

    const result = toGenerationResult(history);

    expect(result).toMatchObject({
      id: 'history-id',
      job_id: 'job-999',
      prompt: undefined,
      negative_prompt: null,
      status: 'completed',
      image_url: null,
      thumbnail_url: null,
      created_at: '2024-01-02T10:00:00.000Z',
      finished_at: null,
      width: 640,
      height: 640,
      steps: 30,
      cfg_scale: 10,
      seed: 1234,
      generation_info: { foo: 'bar' },
    });
  });

  it('supports array helpers for mapping between result types', () => {
    const results: GenerationResult[] = [
      { id: 'one' },
      {
        id: 'two',
        created_at: '2024-01-05T12:00:00.000Z',
        prompt: 'Keep me',
      },
    ];

    const historyList = mapGenerationResultsToHistory(results);

    expect(historyList).toHaveLength(2);
    expect(historyList[0].id).toBe('one');
    expect(historyList[0].created_at).toBe('2024-01-01T00:00:00.000Z');
    expect(historyList[1]).toMatchObject({
      id: 'two',
      prompt: 'Keep me',
      created_at: '2024-01-05T12:00:00.000Z',
    });

    const roundTrip = mapHistoryResultsToGeneration(historyList);

    expect(roundTrip).toEqual([
      expect.objectContaining({ id: 'one', created_at: '2024-01-01T00:00:00.000Z' }),
      expect.objectContaining({ id: 'two', prompt: 'Keep me' }),
    ]);
  });
});
