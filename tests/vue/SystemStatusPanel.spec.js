import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SystemStatusPanel from '../../app/frontend/src/components/SystemStatusPanel.vue';
import { useSettingsStore } from '../../app/frontend/src/stores/settings';

// Mock the global fetch function
global.fetch = vi.fn();

describe('SystemStatusPanel.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const settingsStore = useSettingsStore();
    settingsStore.setSettings({ backendUrl: '/api/v1' });
  });

  it('renders basic structure correctly', () => {
    const wrapper = mount(SystemStatusPanel);
    
    // Check if basic structure is displayed
    expect(wrapper.text()).toContain('System Resources');
    expect(wrapper.text()).toContain('CPU Usage');
    expect(wrapper.text()).toContain('Memory Usage');
    expect(wrapper.text()).toContain('Disk Usage');
    expect(wrapper.text()).toContain('GPU Status');
    expect(wrapper.text()).toContain('Performance Trends');
  });

  it('has initial loading state', () => {
    const wrapper = mount(SystemStatusPanel);
    
    // Should start in loading state
    expect(wrapper.vm.isLoading).toBe(true);
  });

  it('displays placeholder content for no GPU data', () => {
    const wrapper = mount(SystemStatusPanel);
    
    // Should show no GPU info message initially
    expect(wrapper.text()).toContain('No GPU information available');
  });

  it('has formatting utilities', () => {
    const wrapper = mount(SystemStatusPanel);
    
    // Test the formatSize method through computed property
    expect(wrapper.vm.formatSize).toBeDefined();
    expect(wrapper.vm.formatSize(1024)).toBe('1 KB');
    expect(wrapper.vm.formatSize(1048576)).toBe('1 MB');
  });
});