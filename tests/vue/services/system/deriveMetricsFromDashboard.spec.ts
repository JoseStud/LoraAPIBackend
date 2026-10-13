import { describe, expect, it } from 'vitest';

import { deriveMetricsFromDashboard } from '@/services/system/systemService';
import type { DashboardStatsSummary } from '@/types';

const MIB = 1024 ** 2;

const summary = (extra: Partial<DashboardStatsSummary> = {}): DashboardStatsSummary => ({
  stats: { total_loras: 1, active_loras: 0, embeddings_coverage: 0, recent_imports: 1 },
  system_health: {
    status: 'healthy',
    gpu_status: 'AMD Radeon RX 6600/6600 XT/6600M',
    gpu_memory: '2.9 GB / 8.0 GB',
    storage_usage: '435.2 GB / 451.4 GB',
  },
  ...extra,
});

describe('deriveMetricsFromDashboard', () => {
  it('uses live readings for CPU, RAM and GPUs instead of the VRAM string', () => {
    const gpu = { id: 0, name: 'AMD Radeon RX 6600', memory_percent: 36, utilization: 24 };
    const metrics = deriveMetricsFromDashboard(
      summary({
        metrics: {
          cpu_percent: 12,
          memory_percent: 85,
          memory_used: 27392,
          memory_total: 31954,
          disk_percent: 96,
          disk_used: 445_000,
          disk_total: 462_000,
          gpus: [gpu],
        },
      }),
    );

    expect(metrics.cpu_percent).toBe(12);
    expect(metrics.memory_percent).toBe(85);
    expect(metrics.memory_used).toBe(27392 * MIB);
    expect(metrics.memory_total).toBe(31954 * MIB);
    expect(metrics.disk_total).toBe(462_000 * MIB);
    expect(metrics.gpus).toEqual([gpu]);
  });

  it('falls back to the formatted strings when live readings are missing', () => {
    const metrics = deriveMetricsFromDashboard(summary());

    expect(metrics.memory_total).toBe(8 * 1024 ** 3);
    expect(metrics.gpus).toEqual([]);
  });
});
