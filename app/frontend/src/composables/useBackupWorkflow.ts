import { ref, type Ref } from 'vue';

import { ensureData, getJson, postJson } from '@/utils/api';
import type { NotifyFn } from './useExportWorkflow';

export interface BackupEntry {
  id: string;
  type: string;
  size?: number;
  status: string;
  created_at: string;
}

interface UseBackupWorkflowOptions {
  notify: NotifyFn;
}

export interface UseBackupWorkflow {
  backupHistory: Ref<BackupEntry[]>;
  initialize: () => Promise<void>;
  createFullBackup: () => Promise<void>;
  createQuickBackup: () => Promise<void>;
  scheduleBackup: () => void;
  downloadBackup: (backupId: string) => void;
  restoreBackup: (backupId: string) => void;
  deleteBackup: (backupId: string) => void;
}

export function useBackupWorkflow(options: UseBackupWorkflowOptions): UseBackupWorkflow {
  const { notify } = options;
  const history = ref<BackupEntry[]>([]);

  const loadHistory = async () => {
    try {
      const response = await getJson('/api/v1/backups/history');
      const data = response?.data;

      if (Array.isArray(data)) {
        history.value = data as BackupEntry[];
      } else if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>).history)) {
        history.value = (data as { history: BackupEntry[] }).history;
      } else {
        history.value = [];
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to load backup history:', error);
      }
      history.value = [];
    }
  };

  const createBackup = async (backupType: 'full' | 'quick', successMessage: string) => {
    try {
      const result = ensureData(
        await postJson('/api/v1/backup/create', { backup_type: backupType })
      ) as Record<string, unknown> | null;
      const backupId = typeof result?.backup_id === 'string' ? result.backup_id : null;
      notify(backupId ? `${successMessage}: ${backupId}` : successMessage, 'success');
      await loadHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      notify(`Backup failed: ${message}`, 'error');
    }
  };

  const initialize = async () => {
    await loadHistory();
  };

  return {
    backupHistory: history,
    initialize,
    createFullBackup: () => createBackup('full', 'Full backup initiated'),
    createQuickBackup: () => createBackup('quick', 'Quick backup initiated'),
    scheduleBackup: () => {
      notify('Schedule backup functionality coming soon', 'info');
    },
    downloadBackup: (backupId: string) => {
      notify(`Download backup ${backupId} functionality coming soon`, 'info');
    },
    restoreBackup: (backupId: string) => {
      notify(`Restore backup ${backupId} functionality coming soon`, 'info');
    },
    deleteBackup: (backupId: string) => {
      notify(`Delete backup ${backupId} functionality coming soon`, 'info');
    }
  };
}
