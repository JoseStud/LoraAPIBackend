import { describe, it, expect, afterEach, vi } from 'vitest';

import {
  buildAdapterListQuery,
  fetchAdapterList,
  fetchAdapterTags,
  fetchAdapters,
  performBulkLoraAction,
  updateLoraWeight,
  toggleLoraActiveState,
  deleteLora,
  triggerPreviewGeneration,
} from '@/services';
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

  it('fetches adapter lists using the promise-based API client', async () => {
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

    const result = await fetchAdapterList('/api/v1', {
      page: 1,
      perPage: 10,
      search: 'Adapter',
      active: true,
      tags: ['fantasy'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters?page=1&per_page=10&search=Adapter&active=true&tags=fantasy',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 'adapter-1', name: 'Adapter One', active: true, tags: ['fantasy'] });
    expect(result.total).toBe(1);
    expect(result.per_page).toBe(10);
  });

  it('provides a convenience helper for adapter arrays', async () => {
    const payload: AdapterListResponse = {
      items: [
        {
          id: 'adapter-2',
          name: 'Adapter Two',
          version: '1.0',
          canonical_version_name: 'v1',
          description: 'Second adapter',
          author_username: 'tester',
          visibility: 'Public',
          published_at: '2024-01-01T00:00:00Z',
          tags: ['style'],
          trained_words: [],
          triggers: [],
          file_path: '/weights/adapter-2.safetensors',
          weight: 0.6,
          active: false,
          ordinal: 2,
          archetype: null,
          archetype_confidence: null,
          primary_file_name: 'adapter-2.safetensors',
          primary_file_size_kb: 2048,
          primary_file_sha256: 'def456',
          primary_file_download_url: 'https://example.com',
          primary_file_local_path: '/tmp/adapter-2.safetensors',
          supports_generation: true,
          sd_version: '1.5',
          nsfw_level: 0,
          activation_text: 'activate',
          stats: { usage_count: 5 },
          extra: { preview_image: 'preview.png' },
          json_file_path: '/json/adapter-2.json',
          json_file_mtime: '2024-01-01T00:00:00Z',
          json_file_size: 1024,
          last_ingested_at: '2024-01-01T00:00:00Z',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ],
      total: 1,
      filtered: 1,
      page: 1,
      pages: 1,
      per_page: 25,
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

    const result = await fetchAdapters('/api/v1', { perPage: 25 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 'adapter-2', active: false, tags: ['style'] });
  });

  it('fetches adapter tags via the backend API', async () => {
    const payload = { tags: ['fantasy', 'sci-fi'] };
    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(payload),
      text: vi.fn(),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const tags = await fetchAdapterTags('/api/v1/');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters/tags',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
    expect(tags).toEqual(['fantasy', 'sci-fi']);
  });

  it('performs bulk LoRA actions with JSON payloads', async () => {
    const response = {
      ok: true,
      status: 202,
      statusText: 'Accepted',
      headers: new Headers(),
      json: vi.fn(),
      text: vi.fn(),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    await performBulkLoraAction('/api/v1', {
      action: 'activate',
      lora_ids: ['alpha', 'beta'],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters/bulk',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'activate', lora_ids: ['alpha', 'beta'] }),
      }),
    );
  });

  it('updates LoRA weights using PATCH requests', async () => {
    const payload = {
      id: 'adapter-1',
      name: 'Adapter One',
      weight: 0.5,
      active: true,
    };

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(payload),
      text: vi.fn(),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const result = await updateLoraWeight('/api/v1', 'adapter-1', 0.5);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters/adapter-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(result).toMatchObject({ id: 'adapter-1', weight: 0.5 });
  });

  it('toggles LoRA active state via POST requests', async () => {
    const payload = {
      id: 'adapter-2',
      active: true,
    };

    const response = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(payload),
      text: vi.fn(),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const result = await toggleLoraActiveState('/api/v1', 'adapter-2', true);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters/adapter-2/activate',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toMatchObject({ id: 'adapter-2', active: true });
  });

  it('deletes LoRAs without returning a payload', async () => {
    const response = {
      ok: true,
      status: 204,
      statusText: 'No Content',
      headers: new Headers(),
      json: vi.fn(),
      text: vi.fn(),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    await deleteLora('/api/v1', 'adapter-3');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters/adapter-3',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('triggers preview generation and returns parsed payloads', async () => {
    const payload = { preview_id: 'preview-1' };
    const response = {
      ok: true,
      status: 202,
      statusText: 'Accepted',
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: vi.fn().mockResolvedValue(payload),
      text: vi.fn(),
    } as unknown as Response;

    const fetchMock = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
    global.fetch = fetchMock;

    const result = await triggerPreviewGeneration('/api/v1', 'adapter-9');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters/adapter-9/preview',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(payload);
  });
});
