import { effectScope, type EffectScope, type Ref } from 'vue'
import { storeToRefs } from 'pinia'

import {
  createGenerationOrchestratorFactory,
  type GenerationOrchestrator,
} from './createGenerationOrchestrator'
import type { GenerationNotificationAdapter } from './useGenerationTransport'
import type {
  GenerationQueueClient,
  GenerationWebSocketManager,
} from '@/services/generation/updates'
import {
  useGenerationConnectionStore,
  useGenerationFormStore,
  useGenerationQueueStore,
  useGenerationResultsStore,
} from '@/stores/generation'
import { useSettingsStore } from '@/stores'
import type {
  GenerationJob,
  GenerationRequestPayload,
  GenerationResult,
  GenerationStartResponse,
  SystemStatusState,
} from '@/types'

export interface GenerationOrchestratorAcquireOptions {
  notify: GenerationNotificationAdapter['notify']
  debug?: GenerationNotificationAdapter['debug']
  queueClient?: GenerationQueueClient
  websocketManager?: GenerationWebSocketManager
}

interface GenerationOrchestratorConsumer {
  id: symbol
  notify: GenerationNotificationAdapter['notify']
  debug?: GenerationNotificationAdapter['debug']
}

interface GenerationOrchestratorState {
  orchestrator: GenerationOrchestrator | null
  initializationPromise: Promise<void> | null
  isInitialized: boolean
  consumers: Map<symbol, GenerationOrchestratorConsumer>
  scope: EffectScope | null
}

const orchestratorState: GenerationOrchestratorState = {
  orchestrator: null,
  initializationPromise: null,
  isInitialized: false,
  consumers: new Map(),
  scope: null,
}

const notifyAll = (message: string, type: Parameters<GenerationNotificationAdapter['notify']>[1] = 'info') => {
  orchestratorState.consumers.forEach((consumer) => {
    consumer.notify(message, type)
  })
}

const debugAll: GenerationNotificationAdapter['debug'] = (...args: unknown[]) => {
  orchestratorState.consumers.forEach((consumer) => {
    consumer.debug?.(...args)
  })
}

const ensureOrchestrator = (
  options: GenerationOrchestratorAcquireOptions,
  context: {
    showHistory: Ref<boolean>
    configuredBackendUrl: Ref<string | null | undefined>
    queueStoreReturn: ReturnType<typeof useGenerationQueueStore>
    resultsStoreReturn: ReturnType<typeof useGenerationResultsStore>
    connectionStoreReturn: ReturnType<typeof useGenerationConnectionStore>
    historyLimit: Ref<number>
    pollIntervalMs: Ref<number>
  },
): GenerationOrchestrator => {
  if (!orchestratorState.orchestrator) {
    orchestratorState.scope = effectScope(true)

    const createdOrchestrator = orchestratorState.scope.run(() =>
      createGenerationOrchestratorFactory({
        showHistory: context.showHistory,
        configuredBackendUrl: context.configuredBackendUrl,
        notificationAdapter: {
          notify: notifyAll,
          debug: debugAll,
        },
        queueStore: context.queueStoreReturn,
        resultsStore: context.resultsStoreReturn,
        connectionStore: context.connectionStoreReturn,
        historyLimit: context.historyLimit,
        pollIntervalMs: context.pollIntervalMs,
        queueClient: options.queueClient,
        websocketManager: options.websocketManager,
      }),
    )

    if (!createdOrchestrator) {
      orchestratorState.scope.stop()
      orchestratorState.scope = null
      throw new Error('Failed to create generation orchestrator')
    }

    orchestratorState.orchestrator = createdOrchestrator
  }

  return orchestratorState.orchestrator
}

const ensureInitialized = async (): Promise<void> => {
  if (orchestratorState.isInitialized) {
    return
  }

  if (!orchestratorState.orchestrator) {
    throw new Error('Generation orchestrator has not been created yet')
  }

  if (!orchestratorState.initializationPromise) {
    orchestratorState.initializationPromise = orchestratorState.orchestrator
      .initialize()
      .then(() => {
        orchestratorState.isInitialized = true
      })
      .catch((error) => {
        orchestratorState.isInitialized = false
        throw error
      })
      .finally(() => {
        orchestratorState.initializationPromise = null
      })
  }

  await orchestratorState.initializationPromise
}

const releaseConsumer = (id: symbol) => {
  if (!orchestratorState.consumers.has(id)) {
    return
  }

  orchestratorState.consumers.delete(id)

  if (orchestratorState.consumers.size === 0 && orchestratorState.orchestrator) {
    orchestratorState.orchestrator.cleanup()
    orchestratorState.isInitialized = false
    orchestratorState.initializationPromise = null
    orchestratorState.scope?.stop()
    orchestratorState.scope = null
    orchestratorState.orchestrator = null
  }
}

export interface GenerationOrchestratorBinding {
  activeJobs: Ref<GenerationJob[]>
  sortedActiveJobs: Ref<GenerationJob[]>
  recentResults: Ref<GenerationResult[]>
  systemStatus: Ref<SystemStatusState>
  isConnected: Ref<boolean>
  initialize: () => Promise<void>
  cleanup: () => void
  loadSystemStatusData: () => Promise<void>
  loadActiveJobsData: () => Promise<void>
  loadRecentResultsData: (notifySuccess?: boolean) => Promise<void>
  startGeneration: (payload: GenerationRequestPayload) => Promise<GenerationStartResponse>
  cancelJob: (jobId: string) => Promise<void>
  clearQueue: () => Promise<void>
  deleteResult: (resultId: string | number) => Promise<void>
  refreshResults: (notifySuccess?: boolean) => Promise<void>
  canCancelJob: (job: GenerationJob) => boolean
  release: () => void
}

export const useGenerationOrchestratorManager = () => {
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

  const acquire = (
    options: GenerationOrchestratorAcquireOptions,
  ): GenerationOrchestratorBinding => {
    const consumer: GenerationOrchestratorConsumer = {
      id: Symbol('generation-orchestrator-consumer'),
      notify: options.notify,
      debug: options.debug,
    }

    orchestratorState.consumers.set(consumer.id, consumer)

    const orchestrator = ensureOrchestrator(options, {
      showHistory,
      configuredBackendUrl,
      queueStoreReturn: queueStore,
      resultsStoreReturn: resultsStore,
      connectionStoreReturn: connectionStore,
      historyLimit,
      pollIntervalMs,
    })

    const initialize = async (): Promise<void> => {
      await ensureInitialized()
    }

    const cleanup = (): void => {
      releaseConsumer(consumer.id)
    }

    const refreshResults = (notifySuccess = false): Promise<void> =>
      orchestrator.loadRecentResultsData(notifySuccess)

    const binding: GenerationOrchestratorBinding = {
      activeJobs,
      sortedActiveJobs,
      recentResults,
      systemStatus,
      isConnected,
      initialize,
      cleanup,
      loadSystemStatusData: orchestrator.loadSystemStatusData,
      loadActiveJobsData: orchestrator.loadActiveJobsData,
      loadRecentResultsData: orchestrator.loadRecentResultsData,
      startGeneration: orchestrator.startGeneration,
      cancelJob: orchestrator.cancelJob,
      clearQueue: orchestrator.clearQueue,
      deleteResult: orchestrator.deleteResult,
      refreshResults,
      canCancelJob: (job: GenerationJob) => queueStore.isJobCancellable(job),
      release: () => {
        releaseConsumer(consumer.id)
      },
    }

    return binding
  }

  return {
    activeJobs,
    sortedActiveJobs,
    recentResults,
    systemStatus,
    isConnected,
    acquire,
  }
}

export type UseGenerationOrchestratorManagerReturn = ReturnType<
  typeof useGenerationOrchestratorManager
>
