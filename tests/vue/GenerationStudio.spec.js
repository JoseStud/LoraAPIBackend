/**
 * Unit tests for GenerationStudio Vue component
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import GenerationStudio from '../../app/frontend/static/vue/GenerationStudio.vue'

// Mock the API
vi.mock('../../app/frontend/static/vue/composables/useApi.js', () => ({
  useApi: vi.fn(() => ({
    fetchData: vi.fn().mockResolvedValue(null),
    data: { value: null },
    error: { value: null },
    isLoading: { value: false }
  }))
}))

// Mock WebSocket
global.WebSocket = vi.fn(() => ({
  onopen: null,
  onmessage: null,
  onclose: null,
  onerror: null,
  close: vi.fn(),
  readyState: 1
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Mock console methods
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
}

// Mock fetch
global.fetch = vi.fn()

describe('GenerationStudio.vue', () => {
  let wrapper

  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
    fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    })
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  it('renders the main structure correctly', () => {
    wrapper = mount(GenerationStudio)

    // Check main elements
    expect(wrapper.find('.generation-page-container').exists()).toBe(true)
    expect(wrapper.find('.page-title').text()).toBe('Generation Studio')
    expect(wrapper.find('.page-subtitle').text()).toBe('Generate images with AI-powered LoRA integration')
  })

  it('has correct initial state', () => {
    wrapper = mount(GenerationStudio)

    // Check initial parameter values
    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    const widthSelect = wrapper.findAll('select')[0]
    const heightSelect = wrapper.findAll('select')[1]
    
    expect(promptInput.element.value).toBe('')
    expect(widthSelect.element.value).toBe('512')
    expect(heightSelect.element.value).toBe('512')
  })

  it('updates parameters when user inputs change', async () => {
    wrapper = mount(GenerationStudio)

    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    await promptInput.setValue('test prompt')

    expect(promptInput.element.value).toBe('test prompt')
  })

  it('disables generate button when prompt is empty', () => {
    wrapper = mount(GenerationStudio)

    const generateButton = wrapper.find('.btn-primary')
    expect(generateButton.attributes('disabled')).toBeDefined()
  })

  it('enables generate button when prompt is provided', async () => {
    wrapper = mount(GenerationStudio)

    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    await promptInput.setValue('test prompt')

    const generateButton = wrapper.find('.btn-primary')
    expect(generateButton.attributes('disabled')).toBeUndefined()
  })

  it('shows empty state when no active jobs', () => {
    wrapper = mount(GenerationStudio)

    expect(wrapper.text()).toContain('No active jobs')
    expect(wrapper.text()).toContain('Generation queue is empty')
  })

  it('shows empty state when no recent results', () => {
    wrapper = mount(GenerationStudio)

    expect(wrapper.text()).toContain('No results yet')
    expect(wrapper.text()).toContain('Generated images will appear here')
  })

  it('handles random prompt generation', async () => {
    wrapper = mount(GenerationStudio)

    const randomButton = wrapper.findAll('.btn-secondary').find(btn => 
      btn.text().includes('Random Prompt')
    )
    
    await randomButton.trigger('click')

    // Should have updated the prompt input
    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    expect(promptInput.element.value).not.toBe('')
    expect(promptInput.element.value.length).toBeGreaterThan(0)
  })

  it('resets seed to random when random button clicked', async () => {
    wrapper = mount(GenerationStudio)

    const seedInput = wrapper.find('input[type="number"][placeholder="-1 for random"]')
    await seedInput.setValue('12345')

    const randomSeedButton = wrapper.findAll('button').find(btn => 
      btn.text().includes('Random')
    )
    await randomSeedButton.trigger('click')

    expect(seedInput.element.value).toBe('-1')
  })

  it('handles job status classes correctly', () => {
    wrapper = mount(GenerationStudio)

    const component = wrapper.vm

    expect(component.getJobStatusClasses('processing')).toBe('bg-blue-100 text-blue-800')
    expect(component.getJobStatusClasses('queued')).toBe('bg-yellow-100 text-yellow-800')
    expect(component.getJobStatusClasses('completed')).toBe('bg-green-100 text-green-800')
    expect(component.getJobStatusClasses('failed')).toBe('bg-red-100 text-red-800')
    expect(component.getJobStatusClasses('unknown')).toBe('bg-gray-100 text-gray-800')
  })

  it('formats time correctly', () => {
    wrapper = mount(GenerationStudio)

    const component = wrapper.vm
    const now = new Date()
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    expect(component.formatTime(oneMinuteAgo.toISOString())).toMatch(/1m ago/)
    expect(component.formatTime(oneHourAgo.toISOString())).toMatch(/1h ago/)
    expect(component.formatTime(oneDayAgo.toISOString())).toMatch(/1d ago/)
  })

  it('determines job cancellation eligibility correctly', () => {
    wrapper = mount(GenerationStudio)

    const component = wrapper.vm

    expect(component.canCancelJob({ status: 'queued' })).toBe(true)
    expect(component.canCancelJob({ status: 'processing' })).toBe(true)
    expect(component.canCancelJob({ status: 'completed' })).toBe(false)
    expect(component.canCancelJob({ status: 'failed' })).toBe(false)
  })

  it('handles system status classes correctly', () => {
    wrapper = mount(GenerationStudio)

    const component = wrapper.vm

    expect(component.getSystemStatusClasses('healthy')).toBe('text-green-600')
    expect(component.getSystemStatusClasses('degraded')).toBe('text-yellow-600')
    expect(component.getSystemStatusClasses('unhealthy')).toBe('text-red-600')
    expect(component.getSystemStatusClasses('unknown')).toBe('text-gray-600')
  })

  it('saves parameters to localStorage when changed', async () => {
    wrapper = mount(GenerationStudio)

    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    await promptInput.setValue('test prompt for saving')

    // Wait for watcher to trigger
    await wrapper.vm.$nextTick()
    
    // Should have called setItem
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'generation_params',
      expect.stringContaining('test prompt for saving')
    )
  })

  it('attempts to start generation when button is clicked', async () => {
    wrapper = mount(GenerationStudio)

    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    await promptInput.setValue('test prompt')

    const generateButton = wrapper.find('.btn-primary')
    await generateButton.trigger('click')

    // Should have called fetch with the generation endpoint
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/generation/generate'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json'
        }),
        body: expect.stringContaining('test prompt')
      })
    )
  })

  it('shows generate button loading state during generation', async () => {
    // Mock a slow fetch to test loading state
    fetch.mockImplementation(() => new Promise(resolve => {
      setTimeout(() => resolve({
        ok: true,
        json: () => Promise.resolve({ job_id: 'test123' })
      }), 100)
    }))

    wrapper = mount(GenerationStudio)

    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    await promptInput.setValue('test prompt')

    const generateButton = wrapper.find('.btn-primary')
    
    // Start generation
    generateButton.trigger('click')
    
    // Give it a moment to update
    await wrapper.vm.$nextTick()
    
    // Should show loading state
    expect(generateButton.text()).toContain('Generating...')
  })

  it('shows clear queue button as disabled when no jobs', () => {
    wrapper = mount(GenerationStudio)

    const clearButton = wrapper.findAll('.btn-secondary').find(btn => 
      btn.text().includes('Clear Queue')
    )
    
    expect(clearButton.attributes('disabled')).toBeDefined()
  })

  it('handles keyboard input for range sliders', async () => {
    wrapper = mount(GenerationStudio)

    const stepsSlider = wrapper.find('input[type="range"]')
    await stepsSlider.setValue('50')

    expect(stepsSlider.element.value).toBe('50')
  })
})