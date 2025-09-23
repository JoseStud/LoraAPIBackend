import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, watchEffect } from 'vue';

import PerformanceAnalyticsPage from '../../app/frontend/src/views/analytics/PerformanceAnalyticsPage.vue';

const notificationSpies = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showInfo: vi.fn(),
}));

const downloadFileMock = vi.hoisted(() => vi.fn());

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => notificationSpies,
}));
vi.mock('@/composables/shared', async () => {
  const actual = await vi.importActual('@/composables/shared');
  return {
    ...actual,
    useNotifications: () => notificationSpies,
  };
});

vi.mock('@/utils/browser', () => ({
  downloadFile: downloadFileMock,
}));

const createRecordingStub = (name, propsConfig, record) => defineComponent({
  name,
  props: propsConfig,
  emits: ['apply', 'export', 'schedule'],
  setup(props, { slots }) {
    watchEffect(() => {
      record.current = { ...props };
    });
    return () => h('div', { class: `${name}-stub` }, slots.default ? slots.default() : []);
  },
});

let kpiGridProps;
let chartGridProps;
let insightsProps;

const PerformanceAnalyticsKpiGridStub = createRecordingStub(
  'PerformanceAnalyticsKpiGrid',
  {
    kpis: { type: Object, required: true },
    formatDuration: { type: Function, required: true },
  },
  { get current() { return kpiGridProps; }, set current(value) { kpiGridProps = value; } },
);

const PerformanceAnalyticsChartGridStub = createRecordingStub(
  'PerformanceAnalyticsChartGrid',
  {
    chartData: { type: Object, required: true },
  },
  { get current() { return chartGridProps; }, set current(value) { chartGridProps = value; } },
);

const PerformanceAnalyticsInsightsStub = createRecordingStub(
  'PerformanceAnalyticsInsights',
  {
    insights: { type: Array, required: true },
  },
  { get current() { return insightsProps; }, set current(value) { insightsProps = value; } },
);

const PerformanceAnalyticsExportToolbarStub = defineComponent({
  name: 'PerformanceAnalyticsExportToolbar',
  emits: ['export', 'schedule'],
  setup(_, { emit }) {
    return () => h('button', {
      class: 'export-toolbar-stub',
      onClick: () => emit('export', 'csv'),
    }, 'export');
  },
});

const PageHeaderStub = defineComponent({
  name: 'PageHeader',
  props: {
    title: { type: String, required: true },
    subtitle: { type: String, required: true },
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'page-header-stub' }, slots.actions ? slots.actions() : slots.default ? slots.default() : []);
  },
});

const SystemStatusStub = defineComponent({
  name: 'SystemStatusPanel',
  setup: () => () => h('div', { class: 'system-status-panel-stub' }),
});

const SystemStatusCardStub = defineComponent({
  name: 'SystemStatusCard',
  props: { variant: { type: String, default: '' } },
  setup: () => () => h('div', { class: 'system-status-card-stub' }),
});

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
      stats: { usage_count: 12, success_rate: 96.5, avg_time: 43.2 },
    },
    {
      id: 'adapter-2',
      name: 'LoRA Beta',
      version: '1.1',
      stats: { usage_count: 9, success_rate: 94.1, avg_time: 46.7 },
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

const createBlobResponse = () =>
  new Response(new Blob(['id,metric\n1,42'], { type: 'text/csv' }), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="analytics.csv"',
    },
  });

const flushPromises = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const mountPage = () =>
  mount(PerformanceAnalyticsPage, {
    props: {
      showPageHeader: false,
      showSystemStatus: false,
    },
    global: {
      stubs: {
        PageHeader: PageHeaderStub,
        SystemStatusPanel: SystemStatusStub,
        SystemStatusCard: SystemStatusCardStub,
        PerformanceAnalyticsKpiGrid: PerformanceAnalyticsKpiGridStub,
        PerformanceAnalyticsChartGrid: PerformanceAnalyticsChartGridStub,
        PerformanceAnalyticsInsights: PerformanceAnalyticsInsightsStub,
        PerformanceAnalyticsExportToolbar: PerformanceAnalyticsExportToolbarStub,
      },
    },
  });
;

describe('PerformanceAnalyticsPage.vue', () => {
  let wrapper;

  beforeEach(() => {
    kpiGridProps = undefined;
    chartGridProps = undefined;
    insightsProps = undefined;
    downloadFileMock.mockReset();
    notificationSpies.showSuccess.mockReset();
    notificationSpies.showError.mockReset();
    notificationSpies.showInfo.mockReset();

    global.fetch = vi.fn(async (input) => {
      const url = typeof input === 'string' ? input : input.url || '';
      if (url.includes('/analytics/summary')) {
        return createJsonResponse(analyticsSummary);
      }
      if (url.includes('/adapters')) {
        return createJsonResponse(adapterListResponse);
      }
      if (url.includes('/api/v1/export')) {
        return createBlobResponse();
      }
      return createJsonResponse({});
    });
  });

  afterEach(() => {
    wrapper?.unmount();
  });

  it('renders loading state and resolves analytics view', async () => {
    wrapper = mountPage();

    expect(wrapper.text()).toContain('Loading analytics...');

    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.analytics-container').exists()).toBe(true);
    expect(kpiGridProps?.kpis.total_generations).toBe(analyticsSummary.kpis.total_generations);
  });

  it('forwards KPI and chart data to child components', async () => {
    wrapper = mountPage();

    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(kpiGridProps).toBeDefined();
    expect(kpiGridProps.kpis.total_generations).toBe(analyticsSummary.kpis.total_generations);
    expect(kpiGridProps.kpis.success_rate).toBe(analyticsSummary.kpis.success_rate);
    expect(typeof kpiGridProps.formatDuration).toBe('function');

    expect(chartGridProps).toBeDefined();
    expect(chartGridProps.chartData.generationVolume).toEqual(analyticsSummary.chart_data.generation_volume);
    expect(chartGridProps.chartData.performance).toEqual(analyticsSummary.chart_data.performance);
  });

  it('passes insights to the insights component and handles apply events', async () => {
    wrapper = mountPage();

    await flushPromises();
    await wrapper.vm.$nextTick();

    expect(insightsProps).toBeDefined();
    expect(insightsProps.insights).toEqual(analyticsSummary.performance_insights);

    const insightsStub = wrapper.findComponent({ name: 'PerformanceAnalyticsInsights' });
    insightsStub.vm.$emit('apply', analyticsSummary.performance_insights[0]);

    expect(notificationSpies.showInfo).toHaveBeenCalledWith(
      expect.stringContaining('Applying recommendation'),
    );
  });

  it('handles export requests via the toolbar', async () => {
    wrapper = mountPage();

    await flushPromises();
    await wrapper.vm.$nextTick();

    const toolbarStub = wrapper.findComponent({ name: 'PerformanceAnalyticsExportToolbar' });
    toolbarStub.vm.$emit('export', 'csv');

    await flushPromises();

    expect(downloadFileMock).toHaveBeenCalled();
    const [blobArg, filenameArg] = downloadFileMock.mock.calls[0];
    expect(blobArg).toMatchObject({ size: expect.any(Number), type: 'text/csv' });
    expect(filenameArg).toBe('analytics.csv');
    expect(notificationSpies.showSuccess).toHaveBeenCalledWith('Export completed successfully');
  });
});
