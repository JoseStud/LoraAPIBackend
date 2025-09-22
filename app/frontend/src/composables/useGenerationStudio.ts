import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useGenerationPersistence } from '@/composables/useGenerationPersistence'
import { useGenerationUpdates } from '@/composables/useGenerationUpdates'
import {
  cancelGenerationJob,
  deleteGenerationResult,
  startGeneration as startGenerationRequest,
  toGenerationRequestPayload,
} from '@/services/generationService'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import type {
  GenerationFormState,
  GenerationJob,
  GenerationResult,
  NotificationType,
  SystemStatusState,
} from '@/types'

const normalizeProgress = (value?: number | null): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return value <= 1 ? Math.round(value * 100) : Math.round(value)
}

export const useGenerationStudio = () => {
  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore)

  const params = ref<GenerationFormState>({
    prompt: '',
    negative_prompt: '',
    steps: 20,
    sampler_name: 'DPM++ 2M',
    cfg_scale: 7.0,
    width: 512,
    height: 512,
    seed: -1,
    batch_size: 1,
    batch_count: 1,
    denoising_strength: null,
  })

  const systemStatus = ref<SystemStatusState>({ ...appStore.systemStatus })
  const isGenerating = ref(false)
  const showHistory = ref(false)
  const showModal = ref(false)
  const selectedResult = ref<GenerationResult | null>(null)

  const logDebug = (...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console.info('[GenerationStudio]', ...args)
    }
  }

  const showToast = (message: string, type: NotificationType = 'success'): void => {
    logDebug(`[${type.toUpperCase()}] ${message}`)
    appStore.addNotification(message, type)
  }

  const { loadSavedParams, saveParams, savePreset, loadFromComposer, useRandomPrompt } = useGenerationPersistence({
    params,
    showToast,
  })

  const {
    activeJobs,
    recentResults,
    sortedActiveJobs,
    isConnected,
    initialize: initializeUpdates,
    loadRecentResultsData,
  } = useGenerationUpdates({
    appStore,
    systemStatus,
    showHistory,
    configuredBackendUrl,
    logDebug,
    showToast,
  })

  const startGeneration = async (): Promise<void> => {
    const trimmedPrompt = params.value.prompt.trim()
    if (!trimmedPrompt) {
      showToast('Please enter a prompt', 'error')
      return
    }

    isGenerating.value = true

    try {
      params.value.prompt = trimmedPrompt
      const payload = toGenerationRequestPayload({ ...params.value, prompt: trimmedPrompt })
      const response = await startGenerationRequest(payload)

      if (response.job_id) {
        const createdAt = new Date().toISOString()
        const newJob: GenerationJob = {
          id: response.job_id,
          prompt: payload.prompt,
          status: response.status as GenerationJob['status'],
          progress: normalizeProgress(response.progress),
          startTime: createdAt,
          created_at: createdAt,
          width: payload.width,
          height: payload.height,
          steps: payload.steps,
          total_steps: payload.steps,
          cfg_scale: payload.cfg_scale,
          seed: payload.seed,
        }

        appStore.addJob(newJob)
        showToast('Generation started successfully', 'success')
        saveParams(params.value)
      }
    } catch (error) {
      console.error('Error starting generation:', error)
      showToast('Error starting generation', 'error')
    } finally {
      isGenerating.value = false
    }
  }

  const cancelJob = async (jobId: string): Promise<void> => {
    try {
      await cancelGenerationJob(jobId)
      appStore.removeJob(jobId)
      showToast('Generation cancelled', 'success')
    } catch (error) {
      console.error('Error cancelling job:', error)
      showToast('Error cancelling generation', 'error')
    }
  }

  const clearQueue = async (): Promise<void> => {
    if (activeJobs.value.length === 0) {
      return
    }

    if (!window.confirm('Are you sure you want to clear the entire generation queue?')) {
      return
    }

    const cancellableJobs = activeJobs.value.filter((job) => canCancelJob(job))
    await Promise.allSettled(cancellableJobs.map((job) => cancelJob(job.id)))
  }

  const showImageModal = (result: GenerationResult | null): void => {
    if (!result) {
      return
    }
    selectedResult.value = result
    showModal.value = true
  }

  const hideImageModal = (): void => {
    showModal.value = false
    selectedResult.value = null
  }

  const reuseParameters = (result: GenerationResult): void => {
    if (typeof result.prompt === 'string') {
      params.value.prompt = result.prompt
    }
    params.value.negative_prompt = typeof result.negative_prompt === 'string' ? result.negative_prompt : ''
    if (typeof result.width === 'number') {
      params.value.width = result.width
    }
    if (typeof result.height === 'number') {
      params.value.height = result.height
    }
    if (typeof result.steps === 'number') {
      params.value.steps = result.steps
    }
    if (typeof result.cfg_scale === 'number') {
      params.value.cfg_scale = result.cfg_scale
    }
    if (typeof result.seed === 'number') {
      params.value.seed = result.seed
    }

    showToast('Parameters loaded from result', 'success')
  }

  const deleteResult = async (resultId: string | number): Promise<void> => {
    if (!window.confirm('Are you sure you want to delete this result?')) {
      return
    }

    try {
      await deleteGenerationResult(resultId)
      const filtered = recentResults.value.filter((result) => result.id !== resultId)
      appStore.setRecentResults(filtered)
      showToast('Result deleted', 'success')
    } catch (error) {
      console.error('Error deleting result:', error)
      showToast('Error deleting result', 'error')
    }
  }

  const refreshResults = async (): Promise<void> => {
    await loadRecentResultsData()
    showToast('Results refreshed', 'success')
  }

  const formatTime = (dateString?: string): string => {
    if (!dateString) {
      return 'Unknown'
    }

    try {
      const date = new Date(dateString)
      const now = new Date()
      const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

      if (diff < 60) return `${diff}s ago`
      if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
      if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
      return `${Math.floor(diff / 86400)}d ago`
    } catch {
      return 'Unknown'
    }
  }

  const getJobStatusClasses = (status: GenerationJob['status']): string => {
    switch (status) {
      case 'processing':
        return 'bg-blue-100 text-blue-800'
      case 'queued':
        return 'bg-yellow-100 text-yellow-800'
      case 'completed':
        return 'bg-green-100 text-green-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getJobStatusText = (status: GenerationJob['status']): string => {
    switch (status) {
      case 'processing':
        return 'Processing'
      case 'queued':
        return 'Queued'
      case 'completed':
        return 'Completed'
      case 'failed':
        return 'Failed'
      default:
        return 'Unknown'
    }
  }

  const canCancelJob = (job: GenerationJob): boolean => {
    return job.status === 'queued' || job.status === 'processing'
  }

  const getSystemStatusClasses = (status?: string): string => {
    switch (status) {
      case 'healthy':
        return 'text-green-600'
      case 'degraded':
        return 'text-yellow-600'
      case 'unhealthy':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  onMounted(async () => {
    logDebug('Initializing Generation Studio composable...')
    await initializeUpdates()
    loadSavedParams()
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
    cancelJob,
    clearQueue,
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
