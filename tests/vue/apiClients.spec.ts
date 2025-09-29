import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useActiveJobsApi } from '../../app/frontend/src/composables/shared/apiClients';
import { useDashboardStatsApi, useSystemStatusApi } from '../../app/frontend/src/services/system';

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

  it('resolves dashboard stats requests against the configured backend URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchDashboardStats('https://stats.example/backend/');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://stats.example/backend/dashboard/stats',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('resolves system status requests against the configured backend URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse({}));
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchSystemStatus('https://status.example/api');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://status.example/api/system/status',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('resolves active job polling against a remote backend host', async () => {
    const settingsStore = useSettingsStore();
    settingsStore.setSettings({ backendUrl: 'https://remote.example/internal/api/' });

    const fetchMock = vi.fn().mockResolvedValue(createJsonResponse([]));
    global.fetch = fetchMock as unknown as typeof fetch;

    const { fetchData } = useActiveJobsApi();
    await fetchData();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://remote.example/internal/api/generation/jobs/active',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });
});
