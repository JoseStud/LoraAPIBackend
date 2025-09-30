import { computed, onMounted } from 'vue'

import {
  useGenerationPersistence,
  useGenerationStudioDomain,
  useGenerationUI,
} from '@/composables/generation'
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

  const domain = useGenerationStudioDomain({
    params: uiParams,
    notify,
    debug: logDebug,
    onAfterStart: persistParams,
    onAfterInitialize: loadParams,
  })

  const params = computed(() => uiParams.value)
  const isGenerating = computed(() => isGeneratingRef.value)
  const showHistory = computed(() => showHistoryRef.value)
  const showModal = computed(() => showModalRef.value)
  const selectedResult = computed(() => selectedResultRef.value)
  const recentResults = computed(() => recentResultsRef.value)
  const activeJobs = computed(() => domain.activeJobs.value)
  const sortedActiveJobs = computed(() => domain.sortedActiveJobs.value)
  const systemStatus = computed(() => domain.systemStatus.value)
  const isConnected = computed(() => domain.isConnected.value)

  const startGeneration = async (): Promise<void> => {
    await domain.startGeneration()
  }

  const clearQueueWithConfirmation = async (): Promise<void> => {
    if (domain.activeJobs.value.length === 0) {
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

    await domain.clearQueue()
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

    await domain.deleteResult(resultId)
  }

  const refreshResults = async (): Promise<void> => {
    await domain.refreshResults(true)
  }

  const updateParams = (value: GenerationFormState): void => {
    formStore.updateParams(value)
  }

  const toggleHistory = (): void => {
    formStore.toggleHistory()
  }

  onMounted(async () => {
    logDebug('Initializing Generation Studio composable...')
    await domain.initialize()
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
    cancelJob: domain.cancelJob,
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
    canCancelJob: domain.canCancelJob,
    getSystemStatusClasses,
    updateParams,
    toggleHistory,
  }
}

export type UseGenerationStudioReturn = ReturnType<typeof useGenerationStudio>
