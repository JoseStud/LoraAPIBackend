/**
 * Types derived from backend/schemas/import_export.py for backup, export and import flows.
 */

export type ExportGenerationRange = 'all' | 'date_range';

export type ExportFormat = 'zip' | 'tar.gz' | 'json';

export type ExportCompression = 'none' | 'fast' | 'balanced' | 'maximum';

export interface ExportConfig {
  loras: boolean;
  lora_files: boolean;
  lora_metadata: boolean;
  lora_embeddings: boolean;
  generations: boolean;
  generation_range: ExportGenerationRange;
  date_from: string;
  date_to: string;
  user_data: boolean;
  system_config: boolean;
  analytics: boolean;
  format: ExportFormat;
  compression: ExportCompression;
  split_archives: boolean;
  max_size_mb: number;
  encrypt: boolean;
  password: string;
}

export interface ExportEstimate {
  size: string;
  time: string;
}

export type ImportMode = 'merge' | 'replace' | 'skip';

export type ImportConflictResolution = 'ask' | 'keep_existing' | 'overwrite' | 'rename';

export interface ImportConfig {
  mode: ImportMode;
  conflict_resolution: ImportConflictResolution;
  validate: boolean;
  backup_before: boolean;
  password: string;
}

export interface BackupHistoryItem {
  id: string;
  created_at: string;
  type: string;
  size?: number | null;
  status: string;
}

export interface BackupCreateRequest {
  backup_type: string;
}
