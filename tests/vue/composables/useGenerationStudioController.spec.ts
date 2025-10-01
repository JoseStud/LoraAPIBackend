import { describe, it, expect, beforeEach, vi } from 'vitest'

const lifecycle = vi.hoisted(() => ({
  mounted: [] as Array<() => void>,
  unmounted: [] as Array<() => void>,
}))

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')

  return {
    ...actual,
    onMounted: (fn: () => void) => {
      lifecycle.mounted.push(fn)
    },
    onUnmounted: (fn: () => void) => {
      lifecycle.unmounted.push(fn)
    },
  }
})

import { ref } from 'vue'

const orchestratorBindings = vi.hoisted(() => {
  const { ref } = require('vue')

  const binding = {
    activeJobs: ref([] as unknown[]),
    sortedActiveJobs: ref([] as unknown[]),
    recentResults: ref([] as unknown[]),
    systemStatus: ref({ status: 'healthy' }),
    isConnected: ref(true),
    initialize: vi.fn(async () => {}),
    startGeneration: vi.fn(async () => {}),
    cancelJob: vi.fn(async (_jobId: string) => {}),
    clearQueue: vi.fn(async () => {}),
    refreshResults: vi.fn(async (_notify?: boolean) => {}),
    deleteResult: vi.fn(async (_resultId: string | number) => {}),
    canCancelJob: vi.fn(() => true),
    setHistoryLimit: vi.fn(),
    handleBackendUrlChange: vi.fn(async () => {}),
    release: vi.fn(() => {}),
  }

  const acquire = vi.fn(() => binding)

  const manager = {
    activeJobs: binding.activeJobs,
    sortedActiveJobs: binding.sortedActiveJobs,
    recentResults: binding.recentResults,
    systemStatus: binding.systemStatus,
    isConnected: binding.isConnected,
    acquire,
  }

  return { binding, acquire, manager }
})

vi.mock('@/composables/generation/useGenerationOrchestratorManager', () => ({
  useGenerationOrchestratorManager: () => orchestratorBindings.manager,
}))

const formStore = vi.hoisted(() => ({
  setGenerating: vi.fn((_: boolean) => {}),
  setPrompt: vi.fn((_: string) => {}),
}))

vi.mock('@/features/generation/stores/form', () => ({
  useGenerationFormStore: () => formStore,
}))

const servicesMock = vi.hoisted(() => ({
  toGenerationRequestPayload: vi.fn((value: unknown) => ({
    payload: value,
  })),
}))

vi.mock('@/features/generation/services/generationService', () => servicesMock)

const toGenerationRequestPayload = servicesMock.toGenerationRequestPayload

import { useGenerationStudioController } from '@/composables/generation/useGenerationStudioController'
import type { GenerationFormState, GenerationJob } from '@/types'

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

describe('useGenerationStudioController', () => {
  beforeEach(() => {
    orchestratorBindings.acquire.mockClear()
    Object.values(orchestratorBindings.binding).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        ;(value as { mockClear: () => void }).mockClear()
      }
    })
    orchestratorBindings.binding.activeJobs.value = []
    orchestratorBindings.binding.sortedActiveJobs.value = []
    orchestratorBindings.binding.recentResults.value = []
    orchestratorBindings.binding.systemStatus.value = { status: 'healthy' }
    orchestratorBindings.binding.isConnected.value = true
    lifecycle.mounted.length = 0
    lifecycle.unmounted.length = 0
    formStore.setGenerating.mockClear()
    formStore.setPrompt.mockClear()
    toGenerationRequestPayload.mockClear()
  })

  it('acquires an orchestrator binding lazily and initializes it when requested', async () => {
    const params = ref(createParams())
    const notify = vi.fn()
    const afterInitialize = vi.fn()

    const controller = useGenerationStudioController({
      params,
      notify,
      onAfterInitialize: afterInitialize,
    })

    expect(orchestratorBindings.acquire).not.toHaveBeenCalled()

    await controller.initialize()

    expect(orchestratorBindings.acquire).toHaveBeenCalledTimes(1)
    expect(orchestratorBindings.binding.initialize).toHaveBeenCalledTimes(1)
    expect(afterInitialize).toHaveBeenCalledTimes(1)

    const acquireOptions = orchestratorBindings.acquire.mock.calls[0]?.[0]
    expect(acquireOptions?.autoSync).toBe(true)
  })

  it('forwards queue actions to the orchestrator binding', async () => {
    const params = ref(createParams())
    const notify = vi.fn()

    const controller = useGenerationStudioController({
      params,
      notify,
    })

    await controller.initialize()
    await controller.startGeneration()
    await controller.cancelJob('job-1')
    await controller.clearQueue()
    await controller.refreshResults(true)
    await controller.deleteResult('result-1')

    expect(orchestratorBindings.binding.startGeneration).toHaveBeenCalledTimes(1)
    expect(orchestratorBindings.binding.cancelJob).toHaveBeenCalledWith('job-1')
    expect(orchestratorBindings.binding.clearQueue).toHaveBeenCalledTimes(1)
    expect(orchestratorBindings.binding.refreshResults).toHaveBeenCalledWith(true)
    expect(orchestratorBindings.binding.deleteResult).toHaveBeenCalledWith('result-1')
  })

  it('returns false when attempting to start generation with an empty prompt', async () => {
    const params = ref({ ...createParams(), prompt: '   ' })
    const notify = vi.fn()

    const controller = useGenerationStudioController({
      params,
      notify,
    })

    const started = await controller.startGeneration()

    expect(started).toBe(false)
    expect(notify).toHaveBeenCalledWith('Please enter a prompt', 'error')
    expect(formStore.setGenerating).not.toHaveBeenCalled()
  })

  it('starts generation with normalized payload and updates the form store', async () => {
    const params = ref(createParams())
    const notify = vi.fn()
    const onAfterStart = vi.fn()

    const controller = useGenerationStudioController({
      params,
      notify,
      onAfterStart,
    })

    await controller.initialize()
    const started = await controller.startGeneration()

    expect(started).toBe(true)
    expect(formStore.setGenerating).toHaveBeenNthCalledWith(1, true)
    expect(formStore.setGenerating).toHaveBeenLastCalledWith(false)
    expect(formStore.setPrompt).toHaveBeenCalledWith('test prompt')
    const startPayload = orchestratorBindings.binding.startGeneration.mock
      .calls[0]?.[0]
    expect(startPayload).toEqual({ payload: { ...params.value } })
    expect(onAfterStart).toHaveBeenCalledWith({ ...params.value })
    expect(toGenerationRequestPayload).toHaveBeenCalledWith({ ...params.value })
  })

  it('exposes reactive state from the orchestrator manager and delegates canCancelJob', async () => {
    const params = ref(createParams())
    const notify = vi.fn()

    const controller = useGenerationStudioController({
      params,
      notify,
    })

    await controller.initialize()

    orchestratorBindings.binding.activeJobs.value = [{ id: 'job-1' }]
    orchestratorBindings.binding.systemStatus.value = { status: 'degraded' }
    orchestratorBindings.binding.isConnected.value = false

    expect(controller.activeJobs.value).toEqual([{ id: 'job-1' }])
    expect(controller.systemStatus.value).toEqual({ status: 'degraded' })
    expect(controller.isConnected.value).toBe(false)
    expect(controller.canCancelJob({ id: 'job-1' } as GenerationJob)).toBe(true)
  })

  it('forwards custom auto-sync options to the manager acquisition', async () => {
    const params = ref(createParams())
    const notify = vi.fn()

    const controller = useGenerationStudioController({
      params,
      notify,
      autoSync: { historyLimit: false, backendUrl: true },
    })

    await controller.initialize()

    const acquireOptions = orchestratorBindings.acquire.mock.calls[0]?.[0]
    expect(acquireOptions?.autoSync).toEqual({ historyLimit: false, backendUrl: true })
  })

  it('releases the orchestrator binding when unmounted', async () => {
    const params = ref(createParams())
    const notify = vi.fn()

    const controller = useGenerationStudioController({
      params,
      notify,
    })

    await controller.initialize()

    expect(orchestratorBindings.binding.release).not.toHaveBeenCalled()

    lifecycle.unmounted.forEach((callback) => callback())
    lifecycle.unmounted.length = 0

    expect(orchestratorBindings.binding.release).toHaveBeenCalledTimes(1)
  })
})
