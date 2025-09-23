import { describe, it, expect, vi } from 'vitest';

import { useMigrationWorkflow } from '../../app/frontend/src/composables/useMigrationWorkflow';

describe('useMigrationWorkflow', () => {
  const notify = vi.fn();

  it('updates configuration values', () => {
    const workflow = useMigrationWorkflow({ notify });

    workflow.updateConfig('from_version', '1.0');
    workflow.updateConfig('source_path', '/data');

    expect(workflow.migrationConfig.from_version).toBe('1.0');
    expect(workflow.migrationConfig.source_path).toBe('/data');
  });

  it('announces migration actions', () => {
    const workflow = useMigrationWorkflow({ notify });

    workflow.startVersionMigration();
    workflow.startPlatformMigration();

    expect(notify).toHaveBeenCalledWith('Version migration functionality coming soon', 'info');
    expect(notify).toHaveBeenCalledWith('Platform migration functionality coming soon', 'info');
  });
});
