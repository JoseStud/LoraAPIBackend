import { computed, onMounted } from 'vue'

import { useGenerationPersistence } from '@/composables/generation'
import { useGenerationStudioController } from '@/composables/generation'
import { useGenerationUI } from '@/composables/generation'
import { useDialogService, useNotifications } from '@/composables/shared'
import { useGenerationFormStore } from '@/stores/generation'
import type { GenerationFormState, NotificationType } from '@/types'

export const useGenerationStudio = () => {
  const formStore = useGenerationFormStore()

  const { notify: pushNotification } = useNotifications()
  const { confirm: requestConfirmation } = useDialogService()

  const logDebug = (...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console.info('[GenerationStudio]', ...args)
    }
  }

  const notify = (message: string, type: NotificationType = 'success') => {
    logDebug(`[${type.toUpperCase()}] ${message}`)
    pushNotification(message, type)
  }

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
  })

  const controller = useGenerationStudioController({
    params: uiParams,
    notify,
    debug: logDebug,
    onAfterStart: persistParams,
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

  const refreshResults = async (): Promise<void> => {
    await controller.refreshResults(true)
  }

  const updateParams = (value: GenerationFormState): void => {
    formStore.updateParams(value)
  }

  const toggleHistory = (): void => {
    formStore.toggleHistory()
  }

  onMounted(async () => {
    logDebug('Initializing Generation Studio composable...')
    await controller.initialize()
    loadParams()
  })

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
  }
}

export type UseGenerationStudioReturn = ReturnType<typeof useGenerationStudio>
