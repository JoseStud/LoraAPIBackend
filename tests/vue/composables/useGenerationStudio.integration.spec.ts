import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import { useGenerationStudio } from '@/composables/generation/useGenerationStudio'
import { useGenerationFormStore } from '@/stores/generation'
import type { UseGenerationStudioReturn } from '@/composables/generation'

const orchestratorMocks = vi.hoisted(() => {
  const { ref } = require('vue')

  return {
    activeJobs: ref([] as unknown[]),
    sortedActiveJobs: ref([] as unknown[]),
    recentResults: ref([] as unknown[]),
    systemStatus: ref({ status: 'healthy' }),
    isConnected: ref(true),
    initialize: vi.fn().mockResolvedValue(undefined),
    startGeneration: vi.fn().mockResolvedValue(undefined),
    cancelJob: vi.fn().mockResolvedValue(undefined),
    clearQueue: vi.fn().mockResolvedValue(undefined),
    refreshResults: vi.fn().mockResolvedValue(undefined),
    deleteResult: vi.fn().mockResolvedValue(undefined),
    canCancelJob: vi.fn().mockReturnValue(true),
  }
})

vi.mock('@/composables/generation/useGenerationOrchestrator', () => ({
  useGenerationOrchestrator: vi.fn(() => orchestratorMocks),
}))

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}

const mountComposable = async () => {
  const TestComponent = defineComponent({
    setup(_, { expose }) {
      const studio = useGenerationStudio()
      expose({ studio })
      return () => null
    },
  })

  const wrapper = mount(TestComponent)
  await flushPromises()

  return wrapper as typeof wrapper & { vm: { studio: UseGenerationStudioReturn } }
}

describe('useGenerationStudio integration', () => {
  let wrapper: Awaited<ReturnType<typeof mountComposable>>

  beforeEach(async () => {
    vi.clearAllMocks()
    setActivePinia(createPinia())
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      configurable: true,
    })
    Object.defineProperty(window, 'confirm', {
      value: vi.fn().mockReturnValue(true),
      configurable: true,
    })
    localStorageMock.getItem.mockReturnValue(null)
    wrapper = await mountComposable()
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
    }
  })

  it('initializes the controller on mount', () => {
    expect(orchestratorMocks.initialize).toHaveBeenCalled()
  })

  it('starts a generation job and persists parameters', async () => {
    const formStore = useGenerationFormStore()
    formStore.params.prompt = '  integration test prompt  '

    await wrapper.vm.studio.startGeneration()

    expect(orchestratorMocks.startGeneration).toHaveBeenCalledTimes(1)
    const payload = orchestratorMocks.startGeneration.mock.calls[0][0]
    expect(payload.prompt).toBe('integration test prompt')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'generation_params',
      expect.stringContaining('"integration test prompt"'),
    )
    expect(formStore.isGenerating).toBe(false)
  })

  it('forwards cancel actions to the controller', async () => {
    await wrapper.vm.studio.cancelJob('job-456')

    expect(orchestratorMocks.cancelJob).toHaveBeenCalledWith('job-456')
  })

  it('confirms before deleting results and forwards the action', async () => {
    const confirmSpy = window.confirm as unknown as Mock
    confirmSpy.mockReturnValueOnce(true)

    await wrapper.vm.studio.deleteResult('result-789')

    expect(confirmSpy).toHaveBeenCalled()
    expect(orchestratorMocks.deleteResult).toHaveBeenCalledWith('result-789')
  })
})
