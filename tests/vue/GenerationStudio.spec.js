/**
 * Unit tests for GenerationStudio Vue component
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import GenerationStudio from '../../app/frontend/src/components/generation/GenerationStudio.vue'
import { useAppStore } from '../../app/frontend/src/stores/app'
import {
  useGenerationConnectionStore,
  useGenerationFormStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
  useGenerationStudioUiStore,
} from '../../app/frontend/src/stores/generation'
import { PERSISTENCE_KEYS } from '../../app/frontend/src/composables/shared/usePersistence'

const mockStatusController = vi.hoisted(() => ({
  ensureHydrated: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn().mockResolvedValue(undefined),
  start: vi.fn(),
  stop: vi.fn(),
}))

vi.mock('../../app/frontend/src/stores/generation/systemStatusController', () => ({
  acquireSystemStatusController: () => ({
    controller: mockStatusController,
    release: vi.fn(),
  }),
  useSystemStatusController: () => mockStatusController,
}))

const controllerMocks = vi.hoisted(() => {
  const { ref } = require('vue')

  return {
    lastOptions: null,
    lastStartParams: null,
    activeJobs: ref([]),
    sortedActiveJobs: ref([]),
    recentResults: ref([]),
    systemStatus: ref({ status: 'healthy' }),
    isConnected: ref(true),
    initialize: vi.fn(async () => {}),
    startGeneration: vi.fn(async (_payload) => true),
    cancelJob: vi.fn(async (_jobId) => {}),
    clearQueue: vi.fn(async () => {}),
    refreshResults: vi.fn(async (_notify = true) => {}),
    deleteResult: vi.fn(async (_resultId) => {}),
    canCancelJob: vi.fn(() => true),
  }
})

const useGenerationStudioControllerMock = vi.hoisted(() =>
  vi.fn((options) => {
    controllerMocks.lastOptions = options

    return {
      activeJobs: controllerMocks.activeJobs,
      sortedActiveJobs: controllerMocks.sortedActiveJobs,
      recentResults: controllerMocks.recentResults,
      systemStatus: controllerMocks.systemStatus,
      isConnected: controllerMocks.isConnected,
      initialize: vi.fn(async () => {
        await controllerMocks.initialize()
        await options.onAfterInitialize?.()
      }),
      startGeneration: vi.fn(async () => {
        const store = useGenerationFormStore()
        const trimmedPrompt = options.params.value.prompt.trim()

        if (!trimmedPrompt) {
          options.notify('Please enter a prompt', 'error')
          return false
        }

        store.setGenerating(true)

        try {
          store.setPrompt(trimmedPrompt)
          const payload = { ...options.params.value }
          controllerMocks.lastStartParams = payload
          const result = await controllerMocks.startGeneration(payload)
          if (result) {
            options.onAfterStart?.({ ...options.params.value })
          }
          return result
        } finally {
          store.setGenerating(false)
        }
      }),
      cancelJob: controllerMocks.cancelJob,
      clearQueue: controllerMocks.clearQueue,
      refreshResults: vi.fn(async (notifySuccess = true) => {
        await controllerMocks.refreshResults(notifySuccess)
      }),
      deleteResult: controllerMocks.deleteResult,
      canCancelJob: controllerMocks.canCancelJob,
    }
  }),
)

vi.mock('@/composables/generation/useGenerationStudioController', () => ({
  useGenerationStudioController: useGenerationStudioControllerMock,
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
  let uiStore

  beforeEach(() => {
    vi.clearAllMocks()
    appStore = useAppStore()
    appStore.$reset()
    queueStore = useGenerationQueueStore()
    resultsStore = useGenerationResultsStore()
    connectionStore = useGenerationConnectionStore()
    formStore = useGenerationFormStore()
    uiStore = useGenerationStudioUiStore()
    queueStore.reset()
    resultsStore.reset()
    connectionStore.reset()
    formStore.reset()
    uiStore.reset()
    localStorageMock.getItem.mockReturnValue(null)
    controllerMocks.activeJobs.value = []
    controllerMocks.sortedActiveJobs.value = []
    controllerMocks.recentResults.value = []
    controllerMocks.systemStatus.value = { status: 'healthy' }
    controllerMocks.isConnected.value = true
    controllerMocks.lastOptions = null
    controllerMocks.lastStartParams = null
    controllerMocks.initialize.mockResolvedValue(undefined)
    controllerMocks.startGeneration.mockResolvedValue(true)
    controllerMocks.cancelJob.mockResolvedValue(undefined)
    controllerMocks.deleteResult.mockResolvedValue(undefined)
    controllerMocks.clearQueue.mockResolvedValue(undefined)
    controllerMocks.refreshResults.mockResolvedValue(undefined)
    controllerMocks.canCancelJob.mockImplementation((job) =>
      ['queued', 'processing'].includes(job.status),
    )
    useGenerationStudioControllerMock.mockClear()
  })

  afterEach(() => {
    useGenerationStudioControllerMock.mockClear()
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
    expect(formStore.params.prompt).toBe('test prompt')
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

  it('initializes the generation controller when multiple studios mount', async () => {
    const first = mount(GenerationStudio)
    const second = mount(GenerationStudio)

    await nextTick()

    expect(useGenerationStudioControllerMock).toHaveBeenCalledTimes(2)
    expect(controllerMocks.initialize).toHaveBeenCalledTimes(2)

    first.unmount()
    second.unmount()
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
    expect(formStore.params.prompt).toBe(promptInput.element.value)
  })

  it('reflects random seed updates in the input field', async () => {
    wrapper = mount(GenerationStudio)

    const seedInput = wrapper.find('input[type="number"][placeholder="-1 for random"]')
    await seedInput.setValue('12345')
    await nextTick()

    expect(formStore.params.seed).toBe(12345)

    formStore.updateParams({ seed: -1 })
    await nextTick()

    expect(formStore.params.seed).toBe(-1)
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

    await nextTick()
    vi.runOnlyPendingTimers()
    await nextTick()

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      PERSISTENCE_KEYS.generationParams,
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

    expect(controllerMocks.startGeneration).toHaveBeenCalled()
    const [payload] = controllerMocks.startGeneration.mock.calls[0]
    expect(payload).toMatchObject({ prompt: 'test prompt' })
  })

  it('shows generate button loading state during generation', async () => {
    let resolveGeneration = null
    controllerMocks.startGeneration.mockImplementation(
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
    await nextTick()
    await nextTick()

    expect(formStore.isGenerating).toBe(true)
    expect(generateButton.text()).toContain('Generating...')

    expect(resolveGeneration).toBeTruthy()
    resolveGeneration?.(true)
    await nextTick()
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
