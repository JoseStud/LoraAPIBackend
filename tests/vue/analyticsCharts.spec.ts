import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import {
  GENERATION_VOLUME_COLOR,
  PERFORMANCE_SUCCESS_COLOR,
  PERFORMANCE_TIME_COLOR,
  RESOURCE_CPU_COLOR,
  RESOURCE_GPU_COLOR,
  RESOURCE_MEMORY_COLOR,
  buildPalette,
  formatTimeLabel,
} from '../../app/frontend/src/utils/charts';
import GenerationVolumeChart from '../../app/frontend/src/components/analytics/GenerationVolumeChart.vue';
import PerformanceTrendChart from '../../app/frontend/src/components/analytics/PerformanceTrendChart.vue';
import LoraUsageChart from '../../app/frontend/src/components/analytics/LoraUsageChart.vue';
import ResourceUsageChart from '../../app/frontend/src/components/analytics/ResourceUsageChart.vue';

const { chartSpy } = vi.hoisted(() => ({
  chartSpy: vi.fn(),
}));

declare module 'chart.js' {
  interface Chart {
    data: any;
  }
}

vi.mock('chart.js/auto', () => ({
  default: chartSpy,
}));

describe('analytics chart components', () => {
  beforeEach(() => {
    chartSpy.mockReset();
    chartSpy.mockImplementation((_, config = {}) => ({
      data: config && typeof config === 'object' && 'data' in config && config.data
        ? JSON.parse(JSON.stringify(config.data))
        : { labels: [], datasets: [] },
      update: vi.fn(),
      destroy: vi.fn(),
    }));
  });

  it('initialises GenerationVolumeChart with mapped data', () => {
    const sample = [
      { timestamp: '2024-01-01T00:00:00Z', count: 3 },
      { timestamp: '2024-01-01T01:00:00Z', count: 8 },
    ];

    mount(GenerationVolumeChart, { props: { data: sample } });

    expect(chartSpy).toHaveBeenCalledTimes(1);
    const [, config] = chartSpy.mock.calls[0];
    expect(config?.type).toBe('line');
    expect(config?.data?.labels).toEqual(sample.map((point) => formatTimeLabel(point.timestamp)));
    expect(config?.data?.datasets?.[0]?.data).toEqual(sample.map((point) => point.count));
    expect(config?.data?.datasets?.[0]?.borderColor).toBe(GENERATION_VOLUME_COLOR);
  });

  it('updates GenerationVolumeChart when props change', async () => {
    const sample = [
      { timestamp: '2024-01-01T00:00:00Z', count: 3 },
    ];
    const updated = [
      { timestamp: '2024-01-01T02:00:00Z', count: 12 },
    ];

    const wrapper = mount(GenerationVolumeChart, { props: { data: sample } });
    const instance = chartSpy.mock.results[0]?.value;

    await wrapper.setProps({ data: updated });
    await wrapper.vm.$nextTick();

    expect(instance?.update).toHaveBeenCalledTimes(1);
    expect(instance?.data?.datasets?.[0]?.data).toEqual([12]);
    expect(instance?.data?.labels).toEqual(updated.map((point) => formatTimeLabel(point.timestamp)));
  });

  it('initialises PerformanceTrendChart with dual axis datasets', () => {
    const sample = [
      { timestamp: '2024-01-01T00:00:00Z', avg_time: 42, success_rate: 96 },
      { timestamp: '2024-01-01T01:00:00Z', avg_time: 40, success_rate: 97 },
    ];

    mount(PerformanceTrendChart, { props: { data: sample } });

    expect(chartSpy).toHaveBeenCalledTimes(1);
    const [, config] = chartSpy.mock.calls[0];
    expect(config?.type).toBe('line');
    expect(config?.data?.datasets?.[0]?.yAxisID).toBe('y');
    expect(config?.data?.datasets?.[0]?.borderColor).toBe(PERFORMANCE_TIME_COLOR);
    expect(config?.data?.datasets?.[1]?.yAxisID).toBe('y1');
    expect(config?.data?.datasets?.[1]?.borderColor).toBe(PERFORMANCE_SUCCESS_COLOR);
    expect(config?.options?.scales?.y1).toBeTruthy();
  });

  it('initialises LoraUsageChart with palette assignments', () => {
    const sample = [
      { name: 'Alpha', usage_count: 10 },
      { name: 'Beta', usage_count: 5 },
      { name: 'Gamma', usage_count: 7 },
    ];

    mount(LoraUsageChart, { props: { data: sample } });

    expect(chartSpy).toHaveBeenCalledTimes(1);
    const [, config] = chartSpy.mock.calls[0];
    expect(config?.type).toBe('doughnut');
    expect(config?.data?.datasets?.[0]?.data).toEqual(sample.map((item) => item.usage_count));
    expect(config?.data?.datasets?.[0]?.backgroundColor).toEqual(buildPalette(sample.length));
  });

  it('initialises ResourceUsageChart with capped axis and datasets', () => {
    const sample = [
      { timestamp: '2024-01-01T00:00:00Z', cpu_percent: 60, memory_percent: 70, gpu_percent: 80 },
    ];

    mount(ResourceUsageChart, { props: { data: sample } });

    expect(chartSpy).toHaveBeenCalledTimes(1);
    const [, config] = chartSpy.mock.calls[0];
    expect(config?.type).toBe('line');
    const datasets = config?.data?.datasets ?? [];
    expect(datasets[0]?.borderColor).toBe(RESOURCE_CPU_COLOR);
    expect(datasets[1]?.borderColor).toBe(RESOURCE_MEMORY_COLOR);
    expect(datasets[2]?.borderColor).toBe(RESOURCE_GPU_COLOR);
    expect(config?.options?.scales?.y?.max).toBe(100);
  });
});
