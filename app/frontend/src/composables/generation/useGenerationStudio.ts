import { onMounted } from 'vue'

import { useGenerationPersistence } from '@/composables/generation'
import { useGenerationOrchestrator } from '@/composables/generation'
import { useGenerationUI } from '@/composables/generation'
import { useNotifications } from '@/composables/shared'
import { toGenerationRequestPayload } from '@/services/generation/generationService'
import { useGenerationFormStore } from '@/stores/generation'
import type { NotificationType } from '@/types'

export const useGenerationStudio = () => {
  const formStore = useGenerationFormStore()

  const { addNotification } = useNotifications()

  const logDebug = (...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console.info('[GenerationStudio]', ...args)
    }
  }

  const notify = (message: string, type: NotificationType = 'success') => {
    logDebug(`[${type.toUpperCase()}] ${message}`)
    addNotification(message, type)
  }

  const {
    params: uiParams,
    isGenerating,
    showHistory,
    showModal,
    selectedResult,
    recentResults,
    showImageModal,
    hideImageModal,
    reuseParameters,
    formatTime,
    getJobStatusClasses,
    getJobStatusText,
    getSystemStatusClasses,
  } = useGenerationUI({ notify })

  const {
    loadSavedParams,
    saveParams,
    savePreset,
    loadFromComposer,
    useRandomPrompt,
  } = useGenerationPersistence({
    params: uiParams,
    showToast: notify,
  })

  const {
    activeJobs,
    sortedActiveJobs,
    systemStatus,
    isConnected,
    initialize,
    startGeneration: orchestrateStart,
    cancelJob,
    clearQueue,
    refreshResults: refreshRecentResults,
    deleteResult: orchestrateDelete,
    canCancelJob,
  } = useGenerationOrchestrator({
    notify,
    debug: logDebug,
  })

  const startGeneration = async (): Promise<void> => {
    const trimmedPrompt = uiParams.value.prompt.trim()
    if (!trimmedPrompt) {
      notify('Please enter a prompt', 'error')
      return
    }

    formStore.setGenerating(true)

    try {
      uiParams.value.prompt = trimmedPrompt
      const payload = toGenerationRequestPayload({ ...uiParams.value, prompt: trimmedPrompt })
      await orchestrateStart(payload)
      saveParams(uiParams.value)
    } finally {
      formStore.setGenerating(false)
    }
  }

  const clearQueueWithConfirmation = async (): Promise<void> => {
    if (activeJobs.value.length === 0) {
      return
    }

    if (!window.confirm('Are you sure you want to clear the entire generation queue?')) {
      return
    }

    await clearQueue()
  }

  const deleteResult = async (resultId: string | number): Promise<void> => {
    if (!window.confirm('Are you sure you want to delete this result?')) {
      return
    }

    await orchestrateDelete(resultId)
  }

  const refreshResults = async (): Promise<void> => {
    await refreshRecentResults(true)
  }

  onMounted(async () => {
    logDebug('Initializing Generation Studio composable...')
    await initialize()
    loadSavedParams()
  })

  return {
    params: uiParams,
    systemStatus,
    isGenerating,
    showHistory,
    showModal,
    selectedResult,
    activeJobs,
    recentResults,
    sortedActiveJobs,
    isConnected,
    startGeneration,
    cancelJob,
    clearQueue: clearQueueWithConfirmation,
    refreshResults,
    loadFromComposer,
    useRandomPrompt,
    savePreset,
    showImageModal,
    hideImageModal,
    reuseParameters,
    deleteResult,
    formatTime,
    getJobStatusClasses,
    getJobStatusText,
    canCancelJob,
    getSystemStatusClasses,
  }
}

export type UseGenerationStudioReturn = ReturnType<typeof useGenerationStudio>
