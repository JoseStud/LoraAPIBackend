import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  favoriteResult,
  listResults,
  rateResult,
} from '@/features/history/services/historyService';
import { HistoryServiceParseError } from '@/features/history/services/historySchemas';
import type { BackendHttpClient } from '@/services/shared/http';
import type { GenerationHistoryResult } from '@/types';

const iso = '2024-01-01T00:00:00Z';

type BackendStub = BackendHttpClient & {
  resolve: ReturnType<typeof vi.fn>;
  requestJson: ReturnType<typeof vi.fn>;
  getJson: ReturnType<typeof vi.fn>;
  postJson: ReturnType<typeof vi.fn>;
  putJson: ReturnType<typeof vi.fn>;
  patchJson: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  requestBlob: ReturnType<typeof vi.fn>;
};

const createBackendStub = (): BackendStub => ({
  resolve: vi.fn((path?: string) => path ?? ''),
  requestJson: vi.fn(),
  getJson: vi.fn(),
  postJson: vi.fn(),
  putJson: vi.fn(),
  patchJson: vi.fn(),
  delete: vi.fn(),
  requestBlob: vi.fn(),
}) as unknown as BackendStub;

describe('historyService runtime validation', () => {
  let backend: BackendStub;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  const validResult: GenerationHistoryResult = {
    id: 1,
    prompt: 'Prompt',
    negative_prompt: null,
    image_url: null,
    thumbnail_url: null,
    created_at: iso,
    finished_at: null,
    generation_info: null,
    metadata: null,
    rating: null,
    is_favorite: false,
    rating_updated_at: null,
    favorite_updated_at: null,
  };

  beforeEach(() => {
    backend = createBackendStub();
    backend.requestJson.mockReset();
    backend.putJson.mockReset();
    backend.resolve.mockClear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('parses list responses and returns sanitized results', async () => {
    backend.requestJson.mockResolvedValue({
      data: {
        results: [
          validResult,
          { ...validResult, id: '2', rating: 5, is_favorite: true },
        ],
        stats: {
          total_results: 2,
          avg_rating: 2.5,
          total_favorites: 1,
          total_size: 123,
        },
      },
    });

    const output = await listResults({}, {}, backend);

    expect(output.results).toHaveLength(2);
    expect(output.results[0]).toEqual(validResult);
    expect(output.results[1]?.id).toBe('2');
    expect(output.stats).toEqual({
      total_results: 2,
      avg_rating: 2.5,
      total_favorites: 1,
      total_size: 123,
    });
  });

  it('throws a HistoryServiceParseError when list payload is invalid', async () => {
    backend.requestJson.mockResolvedValue({
      data: { results: [{ ...validResult, id: null }] },
    });

    await expect(listResults({}, {}, backend)).rejects.toBeInstanceOf(
      HistoryServiceParseError,
    );
  });

  it('parses rating responses and returns sanitized data', async () => {
    backend.putJson.mockResolvedValue({
      data: { ...validResult, id: 42, rating: 5, is_favorite: true },
    });

    const result = await rateResult(42, 5, backend);

    expect(result).toEqual({ ...validResult, id: 42, rating: 5, is_favorite: true });
  });

  it('throws a HistoryServiceParseError when rating payload is invalid', async () => {
    backend.putJson.mockResolvedValue({ data: { ...validResult, id: undefined } });

    await expect(rateResult(1, 2, backend)).rejects.toBeInstanceOf(HistoryServiceParseError);
  });

  it('throws a HistoryServiceParseError when favorite payload is invalid', async () => {
    backend.putJson.mockResolvedValueOnce({
      data: { ...validResult, id: undefined },
    });

    await expect(favoriteResult(1, true, backend)).rejects.toBeInstanceOf(
      HistoryServiceParseError,
    );
  });
});
