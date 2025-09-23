/**
 * Unit tests for GenerationStudio Vue component
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import GenerationStudio from '../../app/frontend/src/components/generation/GenerationStudio.vue'
import { useAppStore } from '../../app/frontend/src/stores/app'
import {
  useGenerationConnectionStore,
  useGenerationFormStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
} from '../../app/frontend/src/stores/generation'

const mocks = vi.hoisted(() => ({
  startGenerationMock: vi.fn(),
  cancelGenerationJobMock: vi.fn(),
  deleteGenerationResultMock: vi.fn(),
  clearQueueMock: vi.fn(),
  loadRecentResultsMock: vi.fn(),
  initializeMock: vi.fn(),
}))

vi.mock('../../app/frontend/src/services/generationOrchestrator.ts', () => ({
  createGenerationOrchestrator: vi.fn(() => ({
    initialize: mocks.initializeMock,
    cleanup: vi.fn(),
    loadSystemStatusData: vi.fn(),
    loadActiveJobsData: vi.fn(),
    loadRecentResultsData: mocks.loadRecentResultsMock,
    startGeneration: mocks.startGenerationMock,
    cancelJob: mocks.cancelGenerationJobMock,
    clearQueue: mocks.clearQueueMock,
    deleteResult: mocks.deleteGenerationResultMock,
  })),
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
  let appStore
  let queueStore
  let resultsStore
  let connectionStore
  let formStore

  beforeEach(() => {
    vi.clearAllMocks()
    appStore = useAppStore()
    appStore.$reset()
    queueStore = useGenerationQueueStore()
    resultsStore = useGenerationResultsStore()
    connectionStore = useGenerationConnectionStore()
    formStore = useGenerationFormStore()
    queueStore.reset()
    resultsStore.reset()
    connectionStore.reset()
    formStore.reset()
    localStorageMock.getItem.mockReturnValue(null)
    mocks.startGenerationMock.mockResolvedValue({ job_id: 'job-123', status: 'queued', progress: 0 })
    mocks.cancelGenerationJobMock.mockResolvedValue(undefined)
    mocks.deleteGenerationResultMock.mockResolvedValue(undefined)
    mocks.clearQueueMock.mockResolvedValue(undefined)
    mocks.initializeMock.mockResolvedValue(undefined)
    mocks.loadRecentResultsMock.mockResolvedValue(undefined)
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

  it('reflects random seed updates in the input field', async () => {
    wrapper = mount(GenerationStudio)

    const seedInput = wrapper.find('input[type="number"][placeholder="-1 for random"]')
    await seedInput.setValue('12345')
    await wrapper.vm.$nextTick()

    wrapper.vm.params.seed = -1
    await wrapper.vm.$nextTick()

    expect(wrapper.vm.params.seed).toBe(-1)
    expect(seedInput.element.value).toBe('-1')
  })

  it('handles job status classes correctly', () => {
    wrapper = mount(GenerationStudio)

    const component = wrapper.vm

    expect(component.getJobStatusClasses('processing')).toBe('bg-blue-100 text-blue-800')
    expect(component.getJobStatusClasses('queued')).toBe('bg-yellow-100 text-yellow-800')
    expect(component.getJobStatusClasses('completed')).toBe('bg-green-100 text-green-800')
    expect(component.getJobStatusClasses('failed')).toBe('bg-red-100 text-red-800')
    expect(component.getJobStatusText('processing')).toBe('Processing')
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
    vi.useFakeTimers()
    wrapper = mount(GenerationStudio)

    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    await promptInput.setValue('test prompt for saving')

    await wrapper.vm.$nextTick()
    vi.runOnlyPendingTimers()
    await wrapper.vm.$nextTick()

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'generation_params',
      expect.stringContaining('test prompt for saving')
    )

    vi.useRealTimers()
  })

  it('attempts to start generation when button is clicked', async () => {
    wrapper = mount(GenerationStudio)

    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    await promptInput.setValue('test prompt')

    const generateButton = wrapper.find('.btn-primary')
    await generateButton.trigger('click')

    expect(mocks.startGenerationMock).toHaveBeenCalled()
    const [payload] = mocks.startGenerationMock.mock.calls[0]
    expect(payload).toMatchObject({ prompt: 'test prompt' })
  })

  it('shows generate button loading state during generation', async () => {
    let resolveGeneration = null
    mocks.startGenerationMock.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveGeneration = resolve
        }),
    )

    wrapper = mount(GenerationStudio)

    const promptInput = wrapper.find('textarea[placeholder="Enter your prompt..."]')
    await promptInput.setValue('test prompt')

    const generateButton = wrapper.find('.btn-primary')

    await generateButton.trigger('click')
    await wrapper.vm.$nextTick()

    expect(generateButton.text()).toContain('Generating...')

    expect(resolveGeneration).toBeTruthy()
    resolveGeneration?.({ job_id: 'test123', status: 'queued', progress: 0 })
    await wrapper.vm.$nextTick()
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
