import { describe, it, expect, afterEach, vi } from 'vitest';

import { buildAdapterListQuery, fetchAdapters } from '@/services/loraService';
import type { AdapterListResponse } from '@/types';

const originalFetch = global.fetch;

afterEach(() => {
  if (originalFetch) {
    global.fetch = originalFetch;
  }
  vi.clearAllMocks();
});

describe('loraService', () => {
  it('serialises adapter list query parameters', () => {
    const query = buildAdapterListQuery({
      page: 2,
      perPage: 25,
      search: 'anime',
      active: true,
      tags: ['fantasy', 'style'],
      sort: 'created_at_desc',
    });

    expect(query).toBe('?page=2&per_page=25&search=anime&active=true&tags=fantasy%2Cstyle&sort=created_at_desc');
  });

  it('fetches adapters using the typed API composable', async () => {
    const payload: AdapterListResponse = {
      items: [
        {
          id: 'adapter-1',
          name: 'Adapter One',
          version: '1.0',
          canonical_version_name: 'v1',
          description: 'First adapter',
          author_username: 'tester',
          visibility: 'Public',
          published_at: '2024-01-01T00:00:00Z',
          tags: ['fantasy'],
          trained_words: ['magic'],
          triggers: ['spark'],
          file_path: '/weights/adapter-1.safetensors',
          weight: 0.8,
          active: true,
          ordinal: 1,
          archetype: null,
          archetype_confidence: null,
          primary_file_name: 'adapter-1.safetensors',
          primary_file_size_kb: 1024,
          primary_file_sha256: 'abc123',
          primary_file_download_url: 'https://example.com',
          primary_file_local_path: '/tmp/adapter-1.safetensors',
          supports_generation: true,
          sd_version: '1.5',
          nsfw_level: 0,
          activation_text: 'activate',
          stats: { usage_count: 10 },
          extra: { preview_image: 'preview.png' },
          json_file_path: '/json/adapter-1.json',
          json_file_mtime: '2024-01-01T00:00:00Z',
          json_file_size: 2048,
          last_ingested_at: '2024-01-01T00:00:00Z',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ],
      total: 1,
      filtered: 1,
      page: 1,
      pages: 1,
      per_page: 10,
    };

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      url: '/api/v1/adapters',
      json: vi.fn().mockResolvedValue(payload),
      text: vi.fn(),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const result = await fetchAdapters('/api/v1', { page: 1, perPage: 10, search: 'Adapter', active: true, tags: ['fantasy'] });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters?page=1&per_page=10&search=Adapter&active=true&tags=fantasy',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'adapter-1', name: 'Adapter One', active: true, tags: ['fantasy'] });
  });
});
