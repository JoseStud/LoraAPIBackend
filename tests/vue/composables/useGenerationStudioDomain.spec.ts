import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

const controllerBindings = vi.hoisted(() => {
  const { ref } = require('vue')

  const controllerMock = {
    activeJobs: ref([] as unknown[]),
    sortedActiveJobs: ref([] as unknown[]),
    recentResults: ref([] as unknown[]),
    systemStatus: ref({ status: 'healthy' }),
    isConnected: ref(true),
    initialize: vi.fn(async () => {}),
    startGeneration: vi.fn(async () => true),
    cancelJob: vi.fn(async (_jobId: string) => {}),
    clearQueue: vi.fn(async () => {}),
    refreshResults: vi.fn(async (_notify?: boolean) => {}),
    deleteResult: vi.fn(async (_resultId: string | number) => {}),
    canCancelJob: vi.fn(() => true),
  }

  const controllerFactory = vi.fn(() => controllerMock)

  return { controllerMock, controllerFactory }
})

vi.mock('@/composables/generation/useGenerationStudioController', () => ({
  useGenerationStudioController: controllerBindings.controllerFactory,
}))

const controllerMock = controllerBindings.controllerMock
const controllerFactory = controllerBindings.controllerFactory

import { useGenerationStudioDomain } from '@/composables/generation/useGenerationStudioDomain'
import type { GenerationFormState } from '@/types'

const createParams = (): GenerationFormState => ({
  prompt: 'test prompt',
  negative_prompt: '',
  sampler_name: 'Euler',
  width: 512,
  height: 512,
  steps: 20,
  cfg_scale: 7,
  seed: 1,
  batch_size: 1,
  batch_count: 1,
})

describe('useGenerationStudioDomain', () => {
  beforeEach(() => {
    controllerFactory.mockClear()
    Object.values(controllerMock).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        ;(value as { mockClear: () => void }).mockClear()
      }
    })
    controllerMock.activeJobs.value = []
    controllerMock.sortedActiveJobs.value = []
    controllerMock.recentResults.value = []
    controllerMock.systemStatus.value = { status: 'healthy' }
    controllerMock.isConnected.value = true
  })

  it('creates a controller binding without triggering side effects', () => {
    const params = ref(createParams())
    const notify = vi.fn()

    useGenerationStudioDomain({
      params,
      notify,
    })

    expect(controllerFactory).toHaveBeenCalledWith(
      expect.objectContaining({ params, notify }),
    )
    expect(controllerMock.initialize).not.toHaveBeenCalled()
    expect(controllerMock.startGeneration).not.toHaveBeenCalled()
  })

  it('initializes the orchestrator when requested and triggers onAfterInitialize', async () => {
    const params = ref(createParams())
    const notify = vi.fn()
    const afterInitialize = vi.fn()

    const domain = useGenerationStudioDomain({
      params,
      notify,
      onAfterInitialize: afterInitialize,
    })

    await domain.initialize()

    expect(controllerMock.initialize).toHaveBeenCalledTimes(1)
    expect(afterInitialize).toHaveBeenCalledTimes(1)
  })

  it('forwards queue actions to the controller', async () => {
    const params = ref(createParams())
    const notify = vi.fn()

    const domain = useGenerationStudioDomain({
      params,
      notify,
    })

    await domain.startGeneration()
    await domain.cancelJob('job-1')
    await domain.clearQueue()
    await domain.refreshResults(true)
    await domain.deleteResult('result-1')

    expect(controllerMock.startGeneration).toHaveBeenCalledTimes(1)
    expect(controllerMock.cancelJob).toHaveBeenCalledWith('job-1')
    expect(controllerMock.clearQueue).toHaveBeenCalledTimes(1)
    expect(controllerMock.refreshResults).toHaveBeenCalledWith(true)
    expect(controllerMock.deleteResult).toHaveBeenCalledWith('result-1')
  })

  it('exposes the reactive state provided by the controller', () => {
    const params = ref(createParams())
    const notify = vi.fn()

    const domain = useGenerationStudioDomain({
      params,
      notify,
    })

    controllerMock.activeJobs.value = [{ id: 'job-123' }]
    controllerMock.systemStatus.value = { status: 'degraded' }
    controllerMock.isConnected.value = false

    expect(domain.activeJobs.value).toEqual([{ id: 'job-123' }])
    expect(domain.systemStatus.value).toEqual({ status: 'degraded' })
    expect(domain.isConnected.value).toBe(false)
    expect(domain.canCancelJob({ id: 'job-123' } as never)).toBe(true)
  })
})
