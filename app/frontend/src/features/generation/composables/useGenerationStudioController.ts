/**
 * Building blocks of the generation studio, composed by `useGenerationStudio`:
 * - `createStudioVm` / `createGalleryModalVm`: history-panel and result-modal view state, each in
 *   its own effect scope that the caller disposes;
 * - `useGenerationUI`: form/result helpers and status formatting on top of those view models;
 * - `useGenerationStudioController`: the studio's orchestrator binding, acquired on mount and
 *   released on unmount through `useGenerationOrchestratorManager`.
 *
 * `useGenerationStudioController` is part of the feature's public surface (`public.ts`). This
 * module is Studio-only: dashboard widgets must not import it (see `npm run check:bundle`).
 */
import {
  effectScope,
  onMounted,
  onScopeDispose,
  onUnmounted,
  readonly,
  ref,
  shallowRef,
  type Ref,
} from 'vue'
import { storeToRefs } from 'pinia'

import { toGenerationRequestPayload } from '../services/generationService'
import {
  useGenerationOrchestratorManager,
  type GenerationOrchestratorAutoSyncOptions,
  type GenerationOrchestratorBinding,
} from './useGenerationOrchestratorManager'
import { useGenerationFormStore } from '../stores/form'
import type { GenerationFormState, GenerationResult, NotificationType } from '@/types'
import {
  useGenerationOrchestratorFacade,
  type QueueItemView,
  type ReadonlyRef,
  type ResultItemView,
} from '@/features/generation/orchestrator'

// ---------------------------------------------------------------------------------------------
// View models
// ---------------------------------------------------------------------------------------------

export interface GenerationStudioVm {
  showHistory: ReadonlyRef<boolean>
  setShowHistory(value: boolean): void
  toggleHistory(): void
  reset(): void
  dispose(): void
}

export const createStudioVm = (initialShowHistory = false): GenerationStudioVm => {
  const scope = effectScope()

  const vm = scope.run(() => {
    const showHistory = ref(initialShowHistory)

    const setShowHistory = (value: boolean): void => {
      showHistory.value = value
    }

    const toggleHistory = (): void => {
      showHistory.value = !showHistory.value
    }

    const reset = (): void => {
      showHistory.value = initialShowHistory
    }

    onScopeDispose(() => {
      reset()
    })

    return {
      showHistory: readonly(showHistory),
      setShowHistory,
      toggleHistory,
      reset,
    }
  })

  if (!vm) {
    throw new Error('Failed to create generation studio VM')
  }

  const dispose = (): void => {
    scope.stop()
  }

  return {
    ...vm,
    dispose,
  }
}

type ModalReadonlyRef<T> = Readonly<Ref<T>>

export interface GenerationGalleryModalVm {
  isOpen: ModalReadonlyRef<boolean>
  selectedResult: ModalReadonlyRef<GenerationResult | null>
  open(result: GenerationResult): void
  close(): void
  dispose(): void
}

export const createGalleryModalVm = (): GenerationGalleryModalVm => {
  const scope = effectScope()

  const isOpen = ref(false)
  const selectedResult = ref<GenerationResult | null>(null)

  const isOpenReadonly = readonly(isOpen) as ModalReadonlyRef<boolean>
  const selectedResultReadonly = readonly(selectedResult) as ModalReadonlyRef<GenerationResult | null>

  const open = (result: GenerationResult): void => {
    selectedResult.value = result
    isOpen.value = true
  }

  const close = (): void => {
    isOpen.value = false
    selectedResult.value = null
  }

  const reset = (): void => {
    isOpen.value = false
    selectedResult.value = null
  }

  scope.run(() => {
    onScopeDispose(() => {
      reset()
    })

  })

  const dispose = (): void => {
    scope.stop()
  }

  return {
    isOpen: isOpenReadonly,
    selectedResult: selectedResultReadonly,
    open,
    close,
    dispose,
  }
}

// ---------------------------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------------------------

const STATUS_CLASS_MAP = {
  processing: 'bg-blue-100 text-blue-800',
  queued: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
} as const

const STATUS_TEXT_MAP = {
  processing: 'Processing',
  queued: 'Queued',
  completed: 'Completed',
  failed: 'Failed',
} as const

export interface UseGenerationUIOptions {
  notify: (message: string, type?: NotificationType) => void
  studioVm?: GenerationStudioVm
  galleryModalVm?: GenerationGalleryModalVm
}

export const useGenerationUI = ({
  notify,
  studioVm: providedStudioVm,
  galleryModalVm: providedGalleryModalVm,
}: UseGenerationUIOptions) => {
  const formStore = useGenerationFormStore()
  const studioVm = providedStudioVm ?? createStudioVm()
  const galleryModalVm = providedGalleryModalVm ?? createGalleryModalVm()
  const generationFacade = useGenerationOrchestratorFacade()

  const { params, isGenerating } = storeToRefs(formStore)
  const { showHistory } = studioVm
  const { isOpen: showModal, selectedResult } = galleryModalVm
  const recentResults = generationFacade.results

  const toMutableResult = (result: ResultItemView): GenerationResult =>
    ({ ...result } as GenerationResult)

  const showImageModal = (result: ResultItemView | null): void => {
    if (!result) {
      return
    }

    galleryModalVm.open(toMutableResult(result))
  }

  const hideImageModal = (): void => {
    galleryModalVm.close()
  }

  const reuseParameters = (result: ResultItemView): void => {
    formStore.applyResultParameters(toMutableResult(result))

    notify('Parameters loaded from result', 'success')
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

  const getJobStatusClasses = (status: keyof typeof STATUS_CLASS_MAP): string =>
    STATUS_CLASS_MAP[status]

  const getJobStatusText = (status: keyof typeof STATUS_TEXT_MAP): string =>
    STATUS_TEXT_MAP[status]

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

  const dispose = (): void => {
    if (!providedStudioVm) {
      studioVm.dispose()
    }

    if (!providedGalleryModalVm) {
      galleryModalVm.dispose()
    }
  }

  return {
    params,
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
    toggleHistory: studioVm.toggleHistory,
    setShowHistory: studioVm.setShowHistory,
    dispose,
  }
}

export type UseGenerationUIReturn = ReturnType<typeof useGenerationUI>

// ---------------------------------------------------------------------------------------------
// Orchestrator binding
// ---------------------------------------------------------------------------------------------

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
