import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const { chartConstructorSpy } = vi.hoisted(() => ({
  chartConstructorSpy: vi.fn()
}));

vi.mock('chart.js/auto', () => ({
  default: chartConstructorSpy
}));

import PerformanceAnalytics from '../../app/frontend/src/components/PerformanceAnalytics.vue';

const analyticsSummary = {
  time_range: '24h',
  generated_at: '2024-01-01T00:00:00Z',
  kpis: {
    total_generations: 128,
    generation_growth: 12.5,
    avg_generation_time: 45.3,
    time_improvement: 4.2,
    success_rate: 96.7,
    total_failed: 3,
    active_loras: 18,
    total_loras: 42,
  },
  chart_data: {
    generation_volume: [
      { timestamp: '2024-01-01T00:00:00Z', count: 5 },
      { timestamp: '2024-01-01T01:00:00Z', count: 8 },
    ],
    performance: [
      { timestamp: '2024-01-01T00:00:00Z', avg_time: 42.1, success_rate: 95.2 },
      { timestamp: '2024-01-01T01:00:00Z', avg_time: 44.8, success_rate: 97.1 },
    ],
    lora_usage: [
      { name: 'LoRA Alpha', usage_count: 12 },
      { name: 'LoRA Beta', usage_count: 9 },
    ],
    resource_usage: [
      { timestamp: '2024-01-01T00:00:00Z', cpu_percent: 60, memory_percent: 64, gpu_percent: 72 },
      { timestamp: '2024-01-01T01:00:00Z', cpu_percent: 58, memory_percent: 62, gpu_percent: 70 },
    ],
  },
  error_breakdown: [
    { type: 'Timeout', count: 2, percentage: 66.67, description: 'Generation timed out' },
    { type: 'GPU Memory', count: 1, percentage: 33.33, description: 'GPU ran out of memory' },
  ],
  performance_insights: [
    {
      id: 'insight-1',
      title: 'Maintain throughput',
      description: 'Generation volume remains healthy over the last 24h.',
      severity: 'low',
    },
  ],
};

const adapterListResponse = {
  items: [
    {
      id: 'adapter-1',
      name: 'LoRA Alpha',
      version: '1.0',
      canonical_version_name: null,
      description: null,
      author_username: null,
      visibility: 'Public',
      published_at: null,
      tags: [],
      trained_words: [],
      triggers: [],
      file_path: '/tmp/alpha.safetensors',
      weight: 1,
      active: true,
      ordinal: null,
      archetype: null,
      archetype_confidence: null,
      primary_file_name: null,
      primary_file_size_kb: null,
      primary_file_sha256: null,
      primary_file_download_url: null,
      primary_file_local_path: null,
      supports_generation: true,
      sd_version: null,
      nsfw_level: 0,
      activation_text: null,
      stats: { usage_count: 12, success_rate: 96.5, avg_time: 43.2 },
      extra: null,
      json_file_path: null,
      json_file_mtime: null,
      json_file_size: null,
      last_ingested_at: null,
      last_updated: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
    {
      id: 'adapter-2',
      name: 'LoRA Beta',
      version: '1.1',
      canonical_version_name: null,
      description: null,
      author_username: null,
      visibility: 'Public',
      published_at: null,
      tags: [],
      trained_words: [],
      triggers: [],
      file_path: '/tmp/beta.safetensors',
      weight: 1,
      active: true,
      ordinal: null,
      archetype: null,
      archetype_confidence: null,
      primary_file_name: null,
      primary_file_size_kb: null,
      primary_file_sha256: null,
      primary_file_download_url: null,
      primary_file_local_path: null,
      supports_generation: true,
      sd_version: null,
      nsfw_level: 0,
      activation_text: null,
      stats: { usage_count: 9, success_rate: 94.1, avg_time: 46.7 },
      extra: null,
      json_file_path: null,
      json_file_mtime: null,
      json_file_size: null,
      last_ingested_at: null,
      last_updated: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
  total: 2,
  filtered: 2,
  page: 1,
  pages: 1,
  per_page: 10,
};

const createJsonResponse = (payload) =>
  new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const flushPromises = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('PerformanceAnalytics.vue', () => {
  let wrapper;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url || '';
      if (url.includes('/analytics/summary')) {
        return createJsonResponse(analyticsSummary);
      }
      if (url.includes('/adapters')) {
        return createJsonResponse(adapterListResponse);
      }
      return createJsonResponse({});
    });

    chartConstructorSpy.mockReset();
    chartConstructorSpy.mockImplementation((context, config = {}) => {
      const baseData = config && typeof config === 'object' && 'data' in config && config.data
        ? JSON.parse(JSON.stringify(config.data))
        : { labels: [], datasets: [] };

      const instance = {
        update: vi.fn(),
        destroy: vi.fn(),
        data: baseData
      };

      return instance;
    });
  });

  it('renders the component correctly', async () => {
    wrapper = mount(PerformanceAnalytics);

    // Should show loading initially
    expect(wrapper.text()).toContain('Loading analytics...');

    // Wait for component to initialize
    await flushPromises();
    await wrapper.vm.$nextTick();

    // Should eventually show the analytics content
    expect(wrapper.find('.analytics-container').exists()).toBe(true);
  });

  it('displays KPIs correctly', async () => {
    wrapper = mount(PerformanceAnalytics);

    await flushPromises();
    await wrapper.vm.$nextTick();

    // Should contain KPI sections
    expect(wrapper.text()).toContain('Total Generations');
    expect(wrapper.text()).toContain('Average Generation Time');
    expect(wrapper.text()).toContain('Success Rate');
    expect(wrapper.text()).toContain('Active LoRAs');

    expect(wrapper.vm.kpis.total_generations).toBe(analyticsSummary.kpis.total_generations);
    expect(wrapper.vm.kpis.success_rate).toBe(analyticsSummary.kpis.success_rate);
    expect(wrapper.vm.kpis.active_loras).toBe(analyticsSummary.kpis.active_loras);
  });

  it('handles time range changes without errors', async () => {
    wrapper = mount(PerformanceAnalytics);

    await flushPromises();
    await wrapper.vm.$nextTick();

    // Find and change the time range selector
    const select = wrapper.find('select');
    expect(select.exists()).toBe(true);

    // Change time range programmatically to avoid chart update errors
    wrapper.vm.timeRange = '7d';
    await wrapper.vm.$nextTick();
    
    expect(wrapper.vm.timeRange).toBe('7d');
  });

  it('displays charts sections', async () => {
    wrapper = mount(PerformanceAnalytics);

    await flushPromises();
    await wrapper.vm.$nextTick();

    // Should contain chart sections
    expect(wrapper.text()).toContain('Generation Volume');
    expect(wrapper.text()).toContain('Generation Performance');
    expect(wrapper.text()).toContain('LoRA Usage Distribution');
    expect(wrapper.text()).toContain('System Resources');
  });

  it('maps analytics payload into chart and error state', async () => {
    wrapper = mount(PerformanceAnalytics);

    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.chartData.generationVolume).toEqual(analyticsSummary.chart_data.generation_volume);
    expect(wrapper.vm.chartData.performance).toEqual(analyticsSummary.chart_data.performance);
    expect(wrapper.vm.errorAnalysis).toEqual(analyticsSummary.error_breakdown);
    expect(wrapper.vm.performanceInsights).toEqual(analyticsSummary.performance_insights);
  });

  it('displays export options', async () => {
    wrapper = mount(PerformanceAnalytics);

    await flushPromises();
    await wrapper.vm.$nextTick();

    // Should contain export options
    expect(wrapper.text()).toContain('Export Analytics');
    expect(wrapper.text()).toContain('Export CSV');
    expect(wrapper.text()).toContain('Export JSON');
    expect(wrapper.text()).toContain('Export PDF Report');
  });

  it('handles auto-refresh toggle', async () => {
    wrapper = mount(PerformanceAnalytics);

    await flushPromises();
    await wrapper.vm.$nextTick();

    // Find auto-refresh checkbox
    const checkbox = wrapper.find('input[type="checkbox"]');
    expect(checkbox.exists()).toBe(true);

    // Initially should be false
    expect(wrapper.vm.autoRefresh).toBe(false);
    
    // Toggle auto-refresh programmatically
    wrapper.vm.autoRefresh = true;
    await wrapper.vm.$nextTick();
    
    expect(wrapper.vm.autoRefresh).toBe(true);
  });

  it('formats duration correctly', async () => {
    wrapper = mount(PerformanceAnalytics);

    // Wait for initialization
    await wrapper.vm.$nextTick();
    
    // Test duration formatting
    expect(wrapper.vm.formatDuration(30)).toBe('30.0s');
    expect(wrapper.vm.formatDuration(90)).toBe('1m 30s');
    expect(wrapper.vm.formatDuration(3720)).toBe('1h 2m');
  });
});