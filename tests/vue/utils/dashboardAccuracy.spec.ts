import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from '@/utils/format';
import { describeMetricAlerts, deriveSeverityFromMetrics } from '@/utils/systemMetrics';
import type { SystemMetricsSnapshot } from '@/types';

describe('formatRelativeTime with backend timestamps', () => {
  const now = new Date('2026-10-13T22:00:00Z');

  it('reads offset-less ISO timestamps as UTC', () => {
    // the backend stores UTC and serialises it without "Z"
    expect(formatRelativeTime('2026-10-13T20:00:00.123456', now)).toBe('2 hours ago');
    expect(formatRelativeTime('2026-10-13T21:00:00', now)).toBe('1 hour ago');
  });

  it('keeps explicit offsets as they are', () => {
    expect(formatRelativeTime('2026-10-13T23:00:00+02:00', now)).toBe('1 hour ago');
    expect(formatRelativeTime('2026-10-13T21:00:00Z', now)).toBe('1 hour ago');
  });
});

describe('describeMetricAlerts', () => {
  const base: SystemMetricsSnapshot = {
    cpu_percent: 10,
    memory_percent: 40,
    memory_used: 0,
    memory_total: 0,
    disk_percent: 50,
    gpus: [],
  };

  it('explains the status raised by deriveSeverityFromMetrics', () => {
    const metrics = {
      ...base,
      disk_percent: 96,
      memory_percent: 89,
      gpus: [{ id: 0, name: 'RX 6600', temperature: 80, memory_percent: 36 }],
    };

    expect(deriveSeverityFromMetrics(metrics)).toBe('error');
    expect(describeMetricAlerts(metrics)).toEqual([
      'Memory 89% used',
      'Disk 96% full',
      'RX 6600 at 80°C',
    ]);
  });

  it('is empty when everything is within limits', () => {
    expect(deriveSeverityFromMetrics(base)).toBe('healthy');
    expect(describeMetricAlerts(base)).toEqual([]);
  });
});
