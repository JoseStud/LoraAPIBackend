import { ref, type Ref } from 'vue';

import { ensureData } from '@/services/apiClient';
import { useBackendClient, type BackendClient } from '@/services/backendClient';
import type { BackupCreateRequest, BackupHistoryItem } from '@/types';
import type { NotifyFn } from './useExportWorkflow';

interface UseBackupWorkflowOptions {
  notify: NotifyFn;
  backendClient?: BackendClient | null;
}

export interface UseBackupWorkflow {
  backupHistory: Ref<BackupHistoryItem[]>;
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
  const backendClient = options.backendClient ?? useBackendClient();
  const history = ref<BackupHistoryItem[]>([]);

  const loadHistory = async () => {
    try {

      const response = await backendClient.getJson<
        | BackupHistoryItem[]
        | { history?: BackupHistoryItem[] | null }
        | { data?: BackupHistoryItem[] | { history?: BackupHistoryItem[] | null } | null }
        | null
      >('/api/v1/backups/history');

      const payload =
        response && typeof response === 'object' && 'data' in response
          ? (response as { data?: unknown }).data ?? null
          : response;

      const data = payload ?? null;

      if (Array.isArray(data)) {
        history.value = data as BackupHistoryItem[];
      } else if (
        data &&
        typeof data === 'object' &&
        Array.isArray((data as { history?: BackupHistoryItem[] | null }).history)
      ) {
        history.value = (data as { history: BackupHistoryItem[] }).history;
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
      const result =
        ensureData(
          await backendClient.postJson<{ backup_id?: string }, BackupCreateRequest>(
            '/api/v1/backup/create',
            { backup_type: backupType },
          ),
        )
        ?? null;
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
