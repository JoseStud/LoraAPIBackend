import type { NormalizedJobStatus } from '@/types/app';
import {
  DEFAULT_NORMALIZED_JOB_STATUS,
  JOB_STATUS_NORMALIZATION_MAP,
  NORMALIZED_JOB_STATUSES,
} from '@/constants/generated/jobStatuses';

export const normalizeJobStatus = (status?: string | null): NormalizedJobStatus => {
  if (!status) {
    return DEFAULT_NORMALIZED_JOB_STATUS;
  }

  const normalizedKey = status.toLowerCase();
  return (
    JOB_STATUS_NORMALIZATION_MAP[normalizedKey] ?? DEFAULT_NORMALIZED_JOB_STATUS
  );
};

export { NORMALIZED_JOB_STATUSES };

