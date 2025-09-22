import type { NormalizedJobStatus } from '@/types/app';

const STATUS_MAP: Record<string, NormalizedJobStatus> = {
  queued: 'queued',
  pending: 'queued',
  running: 'processing',
  retrying: 'processing',
  processing: 'processing',
  starting: 'processing',
  succeeded: 'completed',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'failed',
};

const DEFAULT_STATUS: NormalizedJobStatus = 'processing';

export const normalizeJobStatus = (status?: string | null): NormalizedJobStatus => {
  if (!status) {
    return DEFAULT_STATUS;
  }

  const normalizedKey = status.toLowerCase();
  return STATUS_MAP[normalizedKey] ?? DEFAULT_STATUS;
};

export const NORMALIZED_JOB_STATUSES: readonly NormalizedJobStatus[] = [
  'queued',
  'processing',
  'completed',
  'failed',
];

