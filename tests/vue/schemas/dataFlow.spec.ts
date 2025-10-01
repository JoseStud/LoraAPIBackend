import { describe, expect, it } from 'vitest';

import {
  GenerationJobStatusSchema,
  GenerationRequestPayloadSchema,
  GenerationResultSchema,
  parseAdapterListPayload,
  parseAdapterTags,
} from '@/schemas';
import { parseHistoryListPayload } from '@/features/history/services/historySchemas';

describe('schema data flow round-trips', () => {
  it('normalizes generation job statuses before storing them', () => {
    const rawJob = {
      id: 1,
      jobId: '42',
      prompt: undefined,
      name: undefined,
      status: 'Completed',
      progress: 0.5,
      message: undefined,
      error: undefined,
      params: null,
      created_at: '2024-01-01T00:00:00Z',
      startTime: undefined,
      finished_at: null,
      result: null,
    } as const;

    const parsed = GenerationJobStatusSchema.parse(rawJob);
    expect(parsed.status).toBe('completed');
    expect(parsed.jobId).toBe('42');

    const roundTrip = GenerationJobStatusSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(roundTrip).toEqual(parsed);
  });

  it('trims and stabilises generation request payloads', () => {
    const payload = GenerationRequestPayloadSchema.parse({
      prompt: 'Generate',
      negative_prompt: '   ',
      steps: 30,
      sampler_name: 'Euler',
      cfg_scale: 7,
      width: 512,
      height: 512,
      seed: -1,
      batch_size: 1,
      n_iter: 1,
      denoising_strength: undefined,
    });

    expect(payload.negative_prompt).toBeNull();
    expect(payload.denoising_strength).toBeNull();

    const roundTrip = GenerationRequestPayloadSchema.parse(JSON.parse(JSON.stringify(payload)));
    expect(roundTrip).toEqual(payload);
  });

  it('preserves generation results through round trips', () => {
    const result = GenerationResultSchema.parse({
      id: 9,
      job_id: 4,
      result_id: 9,
      prompt: 'Test',
      negative_prompt: undefined,
      image_url: undefined,
      thumbnail_url: undefined,
      width: 512,
      height: 512,
      steps: 20,
      cfg_scale: 7,
      seed: null,
      created_at: '2024-01-01T00:00:00Z',
      finished_at: null,
      status: 'Completed',
      generation_info: undefined,
    });

    expect(result.negative_prompt).toBeNull();
    expect(result.status).toBe('completed');

    const roundTrip = GenerationResultSchema.parse(JSON.parse(JSON.stringify(result)));
    expect(roundTrip).toEqual(result);
  });

  it('round-trips history payloads without losing information', () => {
    const payload = {
      results: [
        {
          id: 1,
          job_id: 2,
          status: 'completed',
          prompt: 'test',
          negative_prompt: null,
          image_url: null,
          thumbnail_url: null,
          width: 512,
          height: 512,
          steps: 20,
          cfg_scale: 7,
          seed: null,
          created_at: '2024-01-01T00:00:00Z',
          finished_at: null,
          updated_at: null,
          sampler_name: null,
          sampler: null,
          model: null,
          model_name: null,
          clip_skip: null,
          generation_info: null,
          metadata: null,
          loras: null,
          rating: null,
          is_favorite: false,
          rating_updated_at: null,
          favorite_updated_at: null,
        },
      ],
      stats: {
        total_results: 1,
        avg_rating: 0,
        total_favorites: 0,
        total_size: 0,
      },
      page: 1,
      pages: 1,
      total: 1,
      per_page: 10,
    };

    const parsed = parseHistoryListPayload(payload, 'history test');
    expect(parsed).not.toBeNull();
    expect(Array.isArray(parsed)).toBe(false);

    if (parsed && !Array.isArray(parsed)) {
      const roundTrip = parseHistoryListPayload(JSON.parse(JSON.stringify(parsed)), 'history round trip');
      expect(roundTrip).toEqual(parsed);
    }
  });

  it('normalizes adapter payloads and keeps schema round-trip safe', () => {
    const payload = {
      items: [
        {
          id: 42,
          name: 'Adapter',
          version: '1.0',
          canonical_version_name: null,
          description: 'desc',
          author_username: 'tester',
          visibility: 'Public',
          published_at: null,
          tags: ['tag'],
          trained_words: ['word'],
          triggers: [],
          file_path: '/weights/adapter.safetensors',
          weight: '0.8',
          active: true,
          ordinal: null,
          archetype: null,
          archetype_confidence: null,
          primary_file_name: null,
          primary_file_size_kb: null,
          primary_file_sha256: null,
          primary_file_download_url: null,
          primary_file_local_path: null,
          supports_generation: true,
          sd_version: null,
          nsfw_level: '0',
          activation_text: null,
          stats: { usage_count: '5' },
          extra: null,
          json_file_path: null,
          json_file_mtime: null,
          json_file_size: null,
          last_ingested_at: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
          last_updated: null,
        },
      ],
      total: '1',
      filtered: '1',
      page: '1',
      pages: '1',
      per_page: '25',
    };

    const parsed = parseAdapterListPayload(payload, { perPage: 25 }, 'adapter list');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].weight).toBeCloseTo(0.8);
    expect(parsed.total).toBe(1);
    expect(parsed.per_page).toBe(25);

    const roundTrip = parseAdapterListPayload(JSON.parse(JSON.stringify(parsed)), { perPage: 25 }, 'adapter list round trip');
    expect(roundTrip).toEqual(parsed);

    expect(parseAdapterTags({ tags: ['foo', 'bar'] })).toEqual(['foo', 'bar']);
  });
});
