/**
 * Types derived from backend/schemas/import_export.py for backup, export and import flows.
 */

import type { BackendSchemas } from './generated';

type Schemas = BackendSchemas;

export type ExportGenerationRange = Schemas['ExportConfig']['generation_range'];

export type ExportFormat = Schemas['ExportConfig']['format'];

export type ExportCompression = Schemas['ExportConfig']['compression'];

export type ExportConfig = Schemas['ExportConfig'];

export type ExportEstimate = Schemas['ExportEstimate'];

export type ImportMode = 'merge' | 'replace' | 'skip';

export type ImportConflictResolution = 'ask' | 'keep_existing' | 'overwrite' | 'rename';

export interface ImportConfig {
  mode: ImportMode;
  conflict_resolution: ImportConflictResolution;
  validate: boolean;
  backup_before: boolean;
  password: string;
}

export type BackupHistoryItem = Schemas['BackupHistoryItem'];

export type BackupCreateRequest = Schemas['BackupCreateRequest'];
