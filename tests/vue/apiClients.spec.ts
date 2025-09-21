import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAdapterListApi,
  useDashboardStatsApi,
  useSystemStatusApi,
} from '../../app/frontend/src/composables/apiClients';
import { useSettingsStore } from '../../app/frontend/src/stores/settings';

const createJsonResponse = (payload: unknown): Response => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: vi.fn().mockResolvedValue(payload),
  text: vi.fn().mockResolvedValue(JSON.stringify(payload)),
}) as unknown as Response;

describe('apiClients composables', () => {
  beforeEach(() => {
    const settingsStore = useSettingsStore();
    settingsStore.reset();
    settingsStore.setSettings({ backendUrl: 'https://example.test/api/v1' });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('resolves adapter list requests against the configured backend URL', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.setSettings({ backendUrl: 'https://backend.example/api/v2/' });

    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({ items: [] }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const api = useAdapterListApi({ page: 2, perPage: 25, search: 'demo' });
    await api.fetchData();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://backend.example/api/v2/adapters?page=2&per_page=25&search=demo',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('resolves dashboard stats requests against the configured backend URL', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.setSettings({ backendUrl: 'https://stats.example/backend' });

    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { fetchData } = useDashboardStatsApi();
    await fetchData();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://stats.example/backend/dashboard/stats',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('resolves system status requests against the configured backend URL', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.setSettings({ backendUrl: 'https://status.example/api' });

    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { fetchData } = useSystemStatusApi();
    await fetchData();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://status.example/api/system/status',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });
});
