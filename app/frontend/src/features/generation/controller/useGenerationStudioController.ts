import { onMounted, onUnmounted, shallowRef, type Ref } from 'vue'

import { toGenerationRequestPayload } from '../services/generationService'
import {
  useGenerationOrchestratorManager,
  type GenerationOrchestratorAutoSyncOptions,
  type GenerationOrchestratorBinding,
} from '../composables/useGenerationOrchestratorManager'
import { useGenerationFormStore } from '../stores/form'
import type { GenerationFormState, NotificationType } from '@/types'
import type { QueueItemView } from '@/features/generation/orchestrator'
import type { ReadonlyRef } from '../vm/createStudioVm'

export interface UseGenerationStudioControllerOptions {
  params: Ref<GenerationFormState>
  notify: (message: string, type?: NotificationType) => void
  debug?: (...args: unknown[]) => void
  onAfterStart?: (params: GenerationFormState) => void
  onAfterInitialize?: () => void | Promise<void>
  autoSync?: boolean | GenerationOrchestratorAutoSyncOptions
  historyVisibility: ReadonlyRef<boolean>
}

export const useGenerationStudioController = ({
  params,
  notify,
  debug,
  onAfterStart,
  onAfterInitialize,
  autoSync = true,
  historyVisibility,
}: UseGenerationStudioControllerOptions) => {
  const formStore = useGenerationFormStore()
  const orchestratorManager = useGenerationOrchestratorManager()
  const orchestratorBinding = shallowRef<GenerationOrchestratorBinding | null>(null)

  const ensureBinding = (): GenerationOrchestratorBinding => {
    if (!orchestratorBinding.value) {
      orchestratorBinding.value = orchestratorManager.acquire({
        notify,
        debug,
        autoSync,
        historyVisibility,
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

  const canCancelJob = (job: QueueItemView): boolean =>
    orchestratorBinding.value?.canCancelJob(job) ?? false

  const setHistoryLimit = (limit: number): void => {
    ensureBinding().setHistoryLimit(limit)
  }

  const handleBackendUrlChange = async (): Promise<void> => {
    await ensureBinding().handleBackendUrlChange()
  }

  return {
    activeJobs: orchestratorManager.activeJobs,
    sortedActiveJobs: orchestratorManager.sortedActiveJobs,
    recentResults: orchestratorManager.recentResults,
    systemStatus: orchestratorManager.systemStatus,
    isConnected: orchestratorManager.isConnected,
    isManagerInitialized: orchestratorManager.isInitialized,
    initialize,
    startGeneration,
    cancelJob,
    clearQueue,
    refreshResults,
    deleteResult,
    canCancelJob,
    setHistoryLimit,
    handleBackendUrlChange,
  }
}

export type UseGenerationStudioControllerReturn = ReturnType<typeof useGenerationStudioController>
