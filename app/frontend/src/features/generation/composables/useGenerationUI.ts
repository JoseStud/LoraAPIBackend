import { storeToRefs } from 'pinia'

import { useGenerationFormStore } from '../stores/form'
import { useGenerationStudioUiStore } from '../stores/ui'
import type { GenerationResult, NotificationType } from '@/types'
import {
  useGenerationOrchestratorFacade,
  type ResultItemView,
} from '@/features/generation/orchestrator'

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
}

export const useGenerationUI = ({ notify }: UseGenerationUIOptions) => {
  const formStore = useGenerationFormStore()
  const uiStore = useGenerationStudioUiStore()
  const generationFacade = useGenerationOrchestratorFacade()

  const { params, isGenerating } = storeToRefs(formStore)
  const { showHistory, showModal, selectedResult } = storeToRefs(uiStore)
  const recentResults = generationFacade.results

  const toMutableResult = (result: ResultItemView): GenerationResult =>
    ({ ...result } as GenerationResult)

  const showImageModal = (result: ResultItemView | null): void => {
    if (!result) {
      return
    }

    uiStore.selectResult(toMutableResult(result))
  }

  const hideImageModal = (): void => {
    uiStore.setShowModal(false)
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

  const getJobStatusClasses = (status: keyof typeof STATUS_CLASS_MAP): string => STATUS_CLASS_MAP[status]

  const getJobStatusText = (status: keyof typeof STATUS_TEXT_MAP): string => STATUS_TEXT_MAP[status]

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
    toggleHistory: uiStore.toggleHistory,
    setShowHistory: uiStore.setShowHistory,
  }
}

export type UseGenerationUIReturn = ReturnType<typeof useGenerationUI>
