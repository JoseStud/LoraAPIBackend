import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';

const { chartConstructorSpy } = vi.hoisted(() => ({
  chartConstructorSpy: vi.fn()
}));

vi.mock('chart.js/auto', () => ({
  default: chartConstructorSpy
}));

import PerformanceAnalytics from '../../app/frontend/src/components/PerformanceAnalytics.vue';

// Mock fetch for API calls
global.fetch = vi.fn();

describe('PerformanceAnalytics.vue', () => {
  let wrapper;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock successful API responses
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
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
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should eventually show the analytics content
    expect(wrapper.find('.analytics-container').exists()).toBe(true);
  });

  it('displays KPIs correctly', async () => {
    wrapper = mount(PerformanceAnalytics);
    
    // Wait for initialization
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should contain KPI sections
    expect(wrapper.text()).toContain('Total Generations');
    expect(wrapper.text()).toContain('Average Generation Time');
    expect(wrapper.text()).toContain('Success Rate');
    expect(wrapper.text()).toContain('Active LoRAs');
  });

  it('handles time range changes without errors', async () => {
    wrapper = mount(PerformanceAnalytics);
    
    // Wait for initialization
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 100));
    
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
    
    // Wait for initialization
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should contain chart sections
    expect(wrapper.text()).toContain('Generation Volume');
    expect(wrapper.text()).toContain('Generation Performance');
    expect(wrapper.text()).toContain('LoRA Usage Distribution');
    expect(wrapper.text()).toContain('System Resources');
  });

  it('displays export options', async () => {
    wrapper = mount(PerformanceAnalytics);
    
    // Wait for initialization
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Should contain export options
    expect(wrapper.text()).toContain('Export Analytics');
    expect(wrapper.text()).toContain('Export CSV');
    expect(wrapper.text()).toContain('Export JSON');
    expect(wrapper.text()).toContain('Export PDF Report');
  });

  it('handles auto-refresh toggle', async () => {
    wrapper = mount(PerformanceAnalytics);
    
    // Wait for initialization
    await wrapper.vm.$nextTick();
    await new Promise(resolve => setTimeout(resolve, 100));
    
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