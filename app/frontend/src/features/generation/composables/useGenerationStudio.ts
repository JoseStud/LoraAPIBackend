import { computed } from 'vue'

import { useGenerationPersistence } from './useGenerationPersistence'
import { useGenerationUI } from './useGenerationUI'
import { useGenerationStudioController } from './useGenerationStudioController'
import { useGenerationStudioNotifications } from './useGenerationStudioNotifications'
import { useGenerationFormStore } from '../stores/form'
import { useAsyncLifecycleTask } from '@/composables/shared'
import type { GenerationFormState } from '@/types'

export interface UseGenerationStudioOptions {
  getHistoryLimit: () => number
  getBackendUrl: () => string | null
}

export const useGenerationStudio = ({
  getHistoryLimit,
  getBackendUrl,
}: UseGenerationStudioOptions) => {
  const formStore = useGenerationFormStore()

  const { notify, confirm: requestConfirmation, prompt: requestPrompt, logDebug } =
    useGenerationStudioNotifications()

  const {
    params: uiParams,
    isGenerating: isGeneratingRef,
    showHistory: showHistoryRef,
    showModal: showModalRef,
    selectedResult: selectedResultRef,
    recentResults: recentResultsRef,
    showImageModal,
    hideImageModal,
    reuseParameters,
    formatTime,
    getJobStatusClasses,
    getJobStatusText,
    getSystemStatusClasses,
    toggleHistory,
  } = useGenerationUI({ notify })

  const {
    load: loadParams,
    save: persistParams,
    savePreset,
    loadFromComposer,
    useRandomPrompt,
  } = useGenerationPersistence({
    params: uiParams,
    showToast: notify,
    requestPrompt,
  })

  const controller = useGenerationStudioController({
    params: uiParams,
    notify,
    debug: logDebug,
    onAfterStart: persistParams,
    onAfterInitialize: loadParams,
    getHistoryLimit,
    getBackendUrl,
  })

  const params = computed(() => uiParams.value)
  const isGenerating = computed(() => isGeneratingRef.value)
  const showHistory = computed(() => showHistoryRef.value)
  const showModal = computed(() => showModalRef.value)
  const selectedResult = computed(() => selectedResultRef.value)
  const recentResults = computed(() => recentResultsRef.value)
  const activeJobs = computed(() => controller.activeJobs.value)
  const sortedActiveJobs = computed(() => controller.sortedActiveJobs.value)
  const systemStatus = computed(() => controller.systemStatus.value)
  const isConnected = computed(() => controller.isConnected.value)

  const startGeneration = async (): Promise<void> => {
    await controller.startGeneration()
  }

  const clearQueueWithConfirmation = async (): Promise<void> => {
    if (controller.activeJobs.value.length === 0) {
      return
    }

    const confirmed = await requestConfirmation({
      title: 'Clear generation queue?',
      message: 'Are you sure you want to clear the entire generation queue?',
      confirmLabel: 'Clear queue',
      cancelLabel: 'Keep jobs',
    })

    if (!confirmed) {
      return
    }

    await controller.clearQueue()
  }

  const deleteResult = async (resultId: string | number): Promise<void> => {
    const confirmed = await requestConfirmation({
      title: 'Delete result?',
      message: 'Are you sure you want to delete this generated result?',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
    })

    if (!confirmed) {
      return
    }

    await controller.deleteResult(resultId)
  }

  const refreshResults = async (notifySuccess = true): Promise<void> => {
    await controller.refreshResults(notifySuccess)
  }

  const updateParams = (value: GenerationFormState): void => {
    formStore.updateParams(value)
  }

  useAsyncLifecycleTask(
    async () => {
      logDebug('Initializing Generation Studio composable...')
      await controller.initialize()
    },
    {
      errorMessage: (error) =>
        error instanceof Error
          ? `Failed to initialize the generation studio: ${error.message}`
          : 'Failed to initialize the generation studio.',
      notifyError: (message) => {
        notify(message, 'error')
      },
      logLabel: '[GenerationStudio] Initialization',
    },
  )

  return {
    params,
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
    cancelJob: controller.cancelJob,
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
    canCancelJob: controller.canCancelJob,
    getSystemStatusClasses,
    updateParams,
    toggleHistory,
    setHistoryLimit: controller.setHistoryLimit,
    handleBackendUrlChange: controller.handleBackendUrlChange,
    isManagerInitialized: controller.isManagerInitialized,
  }
}

export type UseGenerationStudioReturn = ReturnType<typeof useGenerationStudio>
