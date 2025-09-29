import type { Ref } from 'vue'

import { toGenerationRequestPayload } from '@/services'
import { useGenerationOrchestrator } from '@/composables/generation'
import { useGenerationFormStore } from '@/stores/generation'
import type { GenerationFormState, NotificationType } from '@/types'

export interface UseGenerationStudioControllerOptions {
  params: Ref<GenerationFormState>
  notify: (message: string, type?: NotificationType) => void
  debug?: (...args: unknown[]) => void
  onAfterStart?: (params: GenerationFormState) => void
}

export const useGenerationStudioController = ({
  params,
  notify,
  debug,
  onAfterStart,
}: UseGenerationStudioControllerOptions) => {
  const formStore = useGenerationFormStore()

  const orchestrator = useGenerationOrchestrator({
    notify,
    debug,
  })

  const initialize = async (): Promise<void> => {
    debug?.('Initializing generation controller...')
    await orchestrator.initialize()
  }

  const startGeneration = async (): Promise<boolean> => {
    const trimmedPrompt = params.value.prompt.trim()
    if (!trimmedPrompt) {
      notify('Please enter a prompt', 'error')
      return false
    }

    formStore.setGenerating(true)

    try {
      params.value.prompt = trimmedPrompt
      const payload = toGenerationRequestPayload({ ...params.value, prompt: trimmedPrompt })
      await orchestrator.startGeneration(payload)
      onAfterStart?.({ ...params.value })
      return true
    } finally {
      formStore.setGenerating(false)
    }
  }

  const refreshResults = async (notifySuccess = true): Promise<void> => {
    await orchestrator.refreshResults(notifySuccess)
  }

  return {
    activeJobs: orchestrator.activeJobs,
    sortedActiveJobs: orchestrator.sortedActiveJobs,
    recentResults: orchestrator.recentResults,
    systemStatus: orchestrator.systemStatus,
    isConnected: orchestrator.isConnected,
    initialize,
    startGeneration,
    cancelJob: orchestrator.cancelJob,
    clearQueue: orchestrator.clearQueue,
    refreshResults,
    deleteResult: orchestrator.deleteResult,
    canCancelJob: orchestrator.canCancelJob,
  }
}

export type UseGenerationStudioControllerReturn = ReturnType<typeof useGenerationStudioController>
