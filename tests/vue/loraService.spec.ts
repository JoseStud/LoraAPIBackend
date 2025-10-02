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
} from '@/features/lora/services/lora/loraService';
import { createBackendClient } from '@/services/shared/http';
import type { AdapterListResponse } from '@/types';

const originalFetch = global.fetch;

const createAdapterPayload = (
  overrides: Partial<AdapterListResponse['items'][number]> = {},
): AdapterListResponse['items'][number] => ({
  id: 'adapter-1',
  name: 'Adapter One',
  version: '1.0',
  canonical_version_name: null,
  description: null,
  author_username: null,
  visibility: 'Public',
  published_at: null,
  tags: [],
  trained_words: [],
  triggers: [],
  file_path: '/weights/adapter-1.safetensors',
  weight: 0.5,
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
  nsfw_level: 0,
  activation_text: null,
  stats: null,
  extra: null,
  json_file_path: null,
  json_file_mtime: null,
  json_file_size: null,
  last_ingested_at: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-02T00:00:00Z',
  last_updated: null,
  ...overrides,
});

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

    const client = createBackendClient('/api/v1');
    const result = await fetchAdapterList({
      page: 1,
      perPage: 10,
      search: 'Adapter',
      active: true,
      tags: ['fantasy'],
    }, client);

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

    const client = createBackendClient('/api/v1');
    const result = await fetchAdapters({ perPage: 25 }, client);

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

    const client = createBackendClient('/api/v1/');
    const tags = await fetchAdapterTags(client);

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

    const client = createBackendClient('/api/v1');
    await performBulkLoraAction({
      action: 'activate',
      lora_ids: ['alpha', 'beta'],
    }, client);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters/bulk',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ action: 'activate', lora_ids: ['alpha', 'beta'] }),
      }),
    );
  });

  it('updates LoRA weights using PATCH requests', async () => {
    const payload = createAdapterPayload({ id: 'adapter-1', weight: 0.5 });

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

    const client = createBackendClient('/api/v1');
    const result = await updateLoraWeight('adapter-1', 0.5, client);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters/adapter-1',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(result).toMatchObject({ id: 'adapter-1', weight: 0.5 });
  });

  it('toggles LoRA active state via POST requests', async () => {
    const payload = createAdapterPayload({ id: 'adapter-2', active: true });

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

    const client = createBackendClient('/api/v1');
    const result = await toggleLoraActiveState('adapter-2', true, client);

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

    const client = createBackendClient('/api/v1');
    await deleteLora('adapter-3', client);

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

    const client = createBackendClient('/api/v1');
    const result = await triggerPreviewGeneration('adapter-9', client);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/adapters/adapter-9/preview',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(payload);
  });
});
