import type { Ref } from 'vue'

import { useGenerationStudioController } from './useGenerationStudioController'
import type { GenerationFormState, NotificationType } from '@/types'

export interface UseGenerationStudioDomainOptions {
  params: Ref<GenerationFormState>
  notify: (message: string, type?: NotificationType) => void
  debug?: (...args: unknown[]) => void
  onAfterStart?: (params: GenerationFormState) => void
  onAfterInitialize?: () => void | Promise<void>
}

export const useGenerationStudioDomain = ({
  params,
  notify,
  debug,
  onAfterStart,
  onAfterInitialize,
}: UseGenerationStudioDomainOptions) => {
  const controller = useGenerationStudioController({
    params,
    notify,
    debug,
    onAfterStart,
  })

  const initialize = async (): Promise<void> => {
    await controller.initialize()
    await onAfterInitialize?.()
  }

  const startGeneration = async (): Promise<boolean> => controller.startGeneration()

  const refreshResults = async (notifySuccess?: boolean): Promise<void> =>
    controller.refreshResults(notifySuccess)

  return {
    activeJobs: controller.activeJobs,
    sortedActiveJobs: controller.sortedActiveJobs,
    recentResults: controller.recentResults,
    systemStatus: controller.systemStatus,
    isConnected: controller.isConnected,
    initialize,
    startGeneration,
    cancelJob: controller.cancelJob,
    clearQueue: controller.clearQueue,
    refreshResults,
    deleteResult: controller.deleteResult,
    canCancelJob: controller.canCancelJob,
  }
}

export type UseGenerationStudioDomainReturn = ReturnType<typeof useGenerationStudioDomain>
