import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useBackupWorkflow } from '../../app/frontend/src/composables/import-export/useBackupWorkflow';
import type { BackendClient } from '../../app/frontend/src/services/backendClient';

const getJson = vi.fn();
const postJson = vi.fn();

const createBackendClientMock = (base = 'https://api.example'): BackendClient => {
  const resolvePath = (path = ''): string => {
    if (!path) {
      return base.replace(/\/+$/, '');
    }
    if (/^https?:\/\//i.test(path)) {
      return path;
    }
    const trimmedBase = base.replace(/\/+$/, '');
    const trimmedPath = path.replace(/^\/+/, '');
    return `${trimmedBase}/${trimmedPath}`;
  };

  return {
    resolve: vi.fn((path?: string) => resolvePath(path ?? '')),
    requestJson: vi.fn(),
    getJson: vi.fn((path: string, init?: RequestInit) => getJson(resolvePath(path), init)),
    postJson: vi.fn((path: string, body: unknown, init?: RequestInit) => postJson(resolvePath(path), body, init)),
    putJson: vi.fn(),
    patchJson: vi.fn(),
    delete: vi.fn(),
    requestBlob: vi.fn(),
  } as unknown as BackendClient;
};

vi.mock('@/services/apiClient', async () => {
  const actual = await vi.importActual<typeof import('@/services/apiClient')>('@/services/apiClient');
  return {
    ...actual,
    ensureData: (value: unknown) => value
  };
});

describe('useBackupWorkflow', () => {
  const notify = vi.fn();
  let backendClient: BackendClient;

  beforeEach(() => {
    backendClient = createBackendClientMock('https://custom.example');
    getJson.mockReset();
    postJson.mockReset();
    notify.mockReset();

    getJson.mockResolvedValue({ data: { history: [{ id: 'b1', type: 'full', size: 1024, status: 'completed', created_at: '2024-01-01' }] } });
    postJson.mockResolvedValue({ backup_id: 'b2' });
  });

  it('loads backup history on initialize', async () => {
    const workflow = useBackupWorkflow({ notify, backendClient });
    await workflow.initialize();

    expect(getJson).toHaveBeenCalledWith('https://custom.example/api/v1/backups/history');
    expect(workflow.backupHistory.value).toHaveLength(1);
    expect(workflow.backupHistory.value[0].id).toBe('b1');
  });

  it('creates backups and refreshes history', async () => {
    const workflow = useBackupWorkflow({ notify, backendClient });
    await workflow.initialize();

    await workflow.createFullBackup();
    expect(postJson).toHaveBeenCalledWith('https://custom.example/api/v1/backup/create', { backup_type: 'full' });
    expect(notify).toHaveBeenCalledWith('Full backup initiated: b2', 'success');

    await workflow.createQuickBackup();
    expect(postJson).toHaveBeenCalledWith('https://custom.example/api/v1/backup/create', { backup_type: 'quick' });
    expect(notify).toHaveBeenCalledWith('Quick backup initiated: b2', 'success');
  });

  it('emits informational notifications for other actions', () => {
    const workflow = useBackupWorkflow({ notify, backendClient });

    workflow.scheduleBackup();
    workflow.downloadBackup('b1');
    workflow.restoreBackup('b1');
    workflow.deleteBackup('b1');

    expect(notify).toHaveBeenCalledWith('Schedule backup functionality coming soon', 'info');
    expect(notify).toHaveBeenCalledWith('Download backup b1 functionality coming soon', 'info');
    expect(notify).toHaveBeenCalledWith('Restore backup b1 functionality coming soon', 'info');
    expect(notify).toHaveBeenCalledWith('Delete backup b1 functionality coming soon', 'info');
  });
});
