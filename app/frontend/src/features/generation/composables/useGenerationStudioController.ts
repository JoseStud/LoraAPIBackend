import { onMounted, onUnmounted, shallowRef, type Ref } from 'vue'

import { toGenerationRequestPayload } from '@/services'
import {
  useGenerationOrchestratorManager,
  type GenerationOrchestratorBinding,
} from './useGenerationOrchestratorManager'
import { useGenerationFormStore } from '@/features/generation/stores'
import type { GenerationFormState, NotificationType, GenerationJob } from '@/types'

export interface UseGenerationStudioControllerOptions {
  params: Ref<GenerationFormState>
  notify: (message: string, type?: NotificationType) => void
  debug?: (...args: unknown[]) => void
  onAfterStart?: (params: GenerationFormState) => void
  onAfterInitialize?: () => void | Promise<void>
}

export const useGenerationStudioController = ({
  params,
  notify,
  debug,
  onAfterStart,
  onAfterInitialize,
}: UseGenerationStudioControllerOptions) => {
  const formStore = useGenerationFormStore()
  const orchestratorManager = useGenerationOrchestratorManager()
  const orchestratorBinding = shallowRef<GenerationOrchestratorBinding | null>(null)

  const ensureBinding = (): GenerationOrchestratorBinding => {
    if (!orchestratorBinding.value) {
      orchestratorBinding.value = orchestratorManager.acquire({
        notify,
        debug,
      })
    }

    return orchestratorBinding.value
  }

  onMounted(() => {
    ensureBinding()
  })

  onUnmounted(() => {
    orchestratorBinding.value?.release()
    orchestratorBinding.value = null
  })

  const initialize = async (): Promise<void> => {
    debug?.('Initializing generation controller...')
    const binding = ensureBinding()
    await binding.initialize()
    await onAfterInitialize?.()
  }

  const startGeneration = async (): Promise<boolean> => {
    const trimmedPrompt = params.value.prompt.trim()
    if (!trimmedPrompt) {
      notify('Please enter a prompt', 'error')
      return false
    }

    formStore.setGenerating(true)

    try {
      formStore.setPrompt(trimmedPrompt)
      const payload = toGenerationRequestPayload({ ...params.value })
      await ensureBinding().startGeneration(payload)
      onAfterStart?.({ ...params.value })
      return true
    } finally {
      formStore.setGenerating(false)
    }
  }

  const refreshResults = async (notifySuccess = true): Promise<void> => {
    await ensureBinding().refreshResults(notifySuccess)
  }

  const cancelJob = async (jobId: string): Promise<void> => {
    await ensureBinding().cancelJob(jobId)
  }

  const clearQueue = async (): Promise<void> => {
    await ensureBinding().clearQueue()
  }

  const deleteResult = async (resultId: string | number): Promise<void> => {
    await ensureBinding().deleteResult(resultId)
  }

  const canCancelJob = (job: GenerationJob): boolean =>
    orchestratorBinding.value?.canCancelJob(job) ?? false

  return {
    activeJobs: orchestratorManager.activeJobs,
    sortedActiveJobs: orchestratorManager.sortedActiveJobs,
    recentResults: orchestratorManager.recentResults,
    systemStatus: orchestratorManager.systemStatus,
    isConnected: orchestratorManager.isConnected,
    initialize,
    startGeneration,
    cancelJob,
    clearQueue,
    refreshResults,
    deleteResult,
    canCancelJob,
  }
}

export type UseGenerationStudioControllerReturn = ReturnType<typeof useGenerationStudioController>
