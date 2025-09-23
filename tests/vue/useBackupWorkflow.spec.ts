import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useBackupWorkflow } from '../../app/frontend/src/composables/useBackupWorkflow';

const getJson = vi.fn();
const postJson = vi.fn();

vi.mock('@/utils/api', async () => {
  const actual = await vi.importActual<typeof import('@/utils/api')>('@/utils/api');
  return {
    ...actual,
    getJson: (...args: unknown[]) => getJson(...args),
    postJson: (...args: unknown[]) => postJson(...args),
    ensureData: (value: unknown) => value
  };
});

describe('useBackupWorkflow', () => {
  const notify = vi.fn();

  beforeEach(() => {
    getJson.mockReset();
    postJson.mockReset();
    notify.mockReset();

    getJson.mockResolvedValue({ data: { history: [{ id: 'b1', type: 'full', size: 1024, status: 'completed', created_at: '2024-01-01' }] } });
    postJson.mockResolvedValue({ backup_id: 'b2' });
  });

  it('loads backup history on initialize', async () => {
    const workflow = useBackupWorkflow({ notify });
    await workflow.initialize();

    expect(getJson).toHaveBeenCalledWith('/api/v1/backups/history');
    expect(workflow.backupHistory.value).toHaveLength(1);
    expect(workflow.backupHistory.value[0].id).toBe('b1');
  });

  it('creates backups and refreshes history', async () => {
    const workflow = useBackupWorkflow({ notify });
    await workflow.initialize();

    await workflow.createFullBackup();
    expect(postJson).toHaveBeenCalledWith('/api/v1/backup/create', { backup_type: 'full' });
    expect(notify).toHaveBeenCalledWith('Full backup initiated: b2', 'success');

    await workflow.createQuickBackup();
    expect(postJson).toHaveBeenCalledWith('/api/v1/backup/create', { backup_type: 'quick' });
    expect(notify).toHaveBeenCalledWith('Quick backup initiated: b2', 'success');
  });

  it('emits informational notifications for other actions', () => {
    const workflow = useBackupWorkflow({ notify });

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
