import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import GenerationStudio from '../../app/frontend/static/vue/GenerationStudio.vue';

// Mock fetch globally
global.fetch = vi.fn();

describe('GenerationStudio', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    
    // Mock successful fetch responses
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
      text: async () => ''
    });
    
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      },
      writable: true,
    });
  });

  it('renders the component with initial state', () => {
    const wrapper = mount(GenerationStudio);
    
    // Check that the component renders
    expect(wrapper.find('.generation-studio-container').exists()).toBe(true);
    
    // Check that prompt input exists
    expect(wrapper.find('textarea[placeholder="Enter your prompt..."]').exists()).toBe(true);
    
    // Check that generate button exists and is initially disabled (no prompt)
    const generateButtons = wrapper.findAll('button').filter(button => 
      button.text().includes('Generate Image')
    );
    expect(generateButtons.length).toBeGreaterThan(0);
    expect(generateButtons[0].attributes('disabled')).toBeDefined();
  });

  it('enables generate button when prompt is entered', async () => {
    const wrapper = mount(GenerationStudio);
    
    // Find prompt textarea and enter text
    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]');
    await promptInput.setValue('test prompt');
    
    // Check that generate button is now enabled
    const generateButtons = wrapper.findAll('button').filter(button => 
      button.text().includes('Generate Image')
    );
    expect(generateButtons[0].attributes('disabled')).toBeUndefined();
  });

  it('updates parameters when sliders are changed', async () => {
    const wrapper = mount(GenerationStudio);
    
    // Find steps slider and change value
    const stepsSlider = wrapper.find('input[type="range"][min="10"]');
    await stepsSlider.setValue('30');
    
    // Check that the displayed value updates
    expect(wrapper.text()).toContain('30');
  });

  it('handles random prompt generation', async () => {
    const wrapper = mount(GenerationStudio);
    
    // Click random prompt button
    const randomButtons = wrapper.findAll('button').filter(button => 
      button.text().includes('Random Prompt')
    );
    expect(randomButtons.length).toBeGreaterThan(0);
    await randomButtons[0].trigger('click');
    
    // Check that prompt field is now filled
    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]');
    expect(promptInput.element.value).toBeTruthy();
  });

  it('handles random seed generation', async () => {
    const wrapper = mount(GenerationStudio);
    
    // Click random seed button - look for the specific button near the seed input
    const randomButtons = wrapper.findAll('button').filter(button => 
      button.text().trim() === 'Random'
    );
    expect(randomButtons.length).toBeGreaterThan(0);
    await randomButtons[0].trigger('click');
    
    // Check that seed is set to -1
    const seedInput = wrapper.find('input[type="number"][placeholder="-1 for random"]');
    expect(seedInput.element.value).toBe('-1');
  });

  it('displays empty state for active jobs initially', () => {
    const wrapper = mount(GenerationStudio);
    
    // Check that empty state message is displayed
    expect(wrapper.text()).toContain('No active generations');
    expect(wrapper.text()).toContain('Start a generation to see progress here');
  });

  it('displays empty state for results initially', () => {
    const wrapper = mount(GenerationStudio);
    
    // Check that empty state message is displayed for results
    expect(wrapper.text()).toContain('No results yet');
    expect(wrapper.text()).toContain('Generated images will appear here');
  });
});