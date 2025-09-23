import { storeToRefs } from 'pinia'

import type { GenerationNotificationAdapter } from '@/composables/generation'
import { createGenerationOrchestrator } from '@/services'
import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '@/services'
import {
  useGenerationConnectionStore,
  useGenerationFormStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
} from '@/stores/generation'
import { useSettingsStore } from '@/stores'
import type { GenerationJob, GenerationRequestPayload } from '@/types'

export interface UseGenerationOrchestratorOptions {
  notify: GenerationNotificationAdapter['notify']
  debug?: GenerationNotificationAdapter['debug']
  queueClient?: GenerationQueueClient
  websocketManager?: GenerationWebSocketManager
}

export const useGenerationOrchestrator = ({
  notify,
  debug,
  queueClient,
  websocketManager,
}: UseGenerationOrchestratorOptions) => {
  const formStore = useGenerationFormStore()
  const queueStore = useGenerationQueueStore()
  const resultsStore = useGenerationResultsStore()
  const connectionStore = useGenerationConnectionStore()
  const settingsStore = useSettingsStore()

  const { showHistory } = storeToRefs(formStore)
  const { backendUrl: configuredBackendUrl } = storeToRefs(settingsStore)
  const { historyLimit, recentResults } = storeToRefs(resultsStore)
  const { pollIntervalMs, systemStatus, isConnected } = storeToRefs(connectionStore)
  const { activeJobs, sortedActiveJobs } = storeToRefs(queueStore)

  const notificationAdapter: GenerationNotificationAdapter = {
    notify,
    debug,
  }

  const orchestrator = createGenerationOrchestrator({
    showHistory,
    configuredBackendUrl,
    notificationAdapter,
    queueStore,
    resultsStore,
    connectionStore,
    historyLimit,
    pollIntervalMs,
    queueClient,
    websocketManager,
  })

  const startGeneration = async (payload: GenerationRequestPayload) =>
    orchestrator.startGeneration(payload)

  const cancelJob = async (jobId: string) => orchestrator.cancelJob(jobId)

  const clearQueue = async () => orchestrator.clearQueue()

  const refreshResults = async (notifySuccess = false) =>
    orchestrator.loadRecentResultsData(notifySuccess)

  const deleteResult = async (resultId: string | number) =>
    orchestrator.deleteResult(resultId)

  const canCancelJob = (job: GenerationJob): boolean => queueStore.isJobCancellable(job)

  return {
    activeJobs,
    sortedActiveJobs,
    recentResults,
    systemStatus,
    isConnected,
    initialize: orchestrator.initialize,
    cleanup: orchestrator.cleanup,
    loadSystemStatus: orchestrator.loadSystemStatusData,
    loadActiveJobs: orchestrator.loadActiveJobsData,
    startGeneration,
    cancelJob,
    clearQueue,
    refreshResults,
    deleteResult,
    canCancelJob,
  }
}

export type UseGenerationOrchestratorReturn = ReturnType<typeof useGenerationOrchestrator>
