import { reactive } from 'vue';

import type { NotifyFn } from './useExportWorkflow';

export interface MigrationConfig {
  from_version: string;
  to_version: string;
  source_platform: string;
  source_path: string;
}

interface UseMigrationWorkflowOptions {
  notify: NotifyFn;
}

export interface UseMigrationWorkflow {
  migrationConfig: MigrationConfig;
  updateConfig: <K extends keyof MigrationConfig>(key: K, value: MigrationConfig[K]) => void;
  startVersionMigration: () => void;
  startPlatformMigration: () => void;
}

export function useMigrationWorkflow(options: UseMigrationWorkflowOptions): UseMigrationWorkflow {
  const { notify } = options;

  const migrationConfig = reactive<MigrationConfig>({
    from_version: '2.0',
    to_version: '2.1',
    source_platform: 'automatic1111',
    source_path: ''
  });

  const updateConfig = <K extends keyof MigrationConfig>(key: K, value: MigrationConfig[K]) => {
    migrationConfig[key] = value;
  };

  const startVersionMigration = () => {
    notify('Version migration functionality coming soon', 'info');
  };

  const startPlatformMigration = () => {
    notify('Platform migration functionality coming soon', 'info');
  };

  return {
    migrationConfig,
    updateConfig,
    startVersionMigration,
    startPlatformMigration
  };
}
