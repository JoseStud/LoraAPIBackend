import { describe, expect, it } from 'vitest';

import {
  DEFAULT_NORMALIZED_JOB_STATUS,
  JOB_STATUS_NORMALIZATION_MAP,
} from '../../app/frontend/src/constants/generated/jobStatuses';
import { NORMALIZED_JOB_STATUSES, normalizeJobStatus } from '../../app/frontend/src/utils/status';


describe('normalizeJobStatus', () => {
  it('exposes the expected normalized job statuses', () => {
    expect(NORMALIZED_JOB_STATUSES).toEqual([
      'queued',
      'processing',
      'completed',
      'failed',
    ]);
  });

  it('normalizes every shared backend status mapping', () => {
    for (const [raw, normalized] of Object.entries(JOB_STATUS_NORMALIZATION_MAP)) {
      expect(normalizeJobStatus(raw)).toBe(normalized);
    }
  });

  it('falls back to the default status for unknown values', () => {
    expect(normalizeJobStatus(undefined)).toBe(DEFAULT_NORMALIZED_JOB_STATUS);
    expect(normalizeJobStatus(null)).toBe(DEFAULT_NORMALIZED_JOB_STATUS);
    expect(normalizeJobStatus('mystery')).toBe(DEFAULT_NORMALIZED_JOB_STATUS);
  });
});
