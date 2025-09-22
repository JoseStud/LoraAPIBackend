import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import { storeToRefs } from 'pinia'

import { useActiveJobsApi, useRecentResultsApi, useSystemStatusApi } from '@/composables/apiClients'
import { resolveBackendUrl, resolveGenerationBaseUrl } from '@/services/generationService'
import { useAppStore } from '@/stores/app'
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationJob,
  GenerationProgressMessage,
  GenerationResult,
  NotificationType,
  ProgressUpdate,
  SystemStatusPayload,
  SystemStatusState,
  WebSocketMessage,
} from '@/types'

interface UseGenerationUpdatesOptions {
  appStore: ReturnType<typeof useAppStore>
  systemStatus: Ref<SystemStatusState>
  showHistory: Ref<boolean>
  configuredBackendUrl: Ref<string | null | undefined>
  logDebug: (...args: unknown[]) => void
  showToast: (message: string, type?: NotificationType) => void
}

export interface UseGenerationUpdatesReturn {
  activeJobs: Ref<GenerationJob[]>
  recentResults: Ref<GenerationResult[]>
  sortedActiveJobs: ComputedRef<GenerationJob[]>
  isConnected: ComputedRef<boolean>
  initialize: () => Promise<void>
  cleanup: () => void
  loadSystemStatusData: () => Promise<void>
  loadActiveJobsData: () => Promise<void>
  loadRecentResultsData: () => Promise<void>
}

const parseTimestamp = (value?: string): number => {
  if (!value) {
    return 0
  }
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const normalizeProgress = (value?: number | null): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }
  return value <= 1 ? Math.round(value * 100) : Math.round(value)
}

const appendWebSocketPath = (path: string): string => {
  const trimmed = path.replace(/\/+$/, '')
  if (trimmed) {
    return `${trimmed}/ws/progress`
  }
  return '/api/v1/ws/progress'
}

const resolveWebSocketUrl = (backendUrl?: string | null): string => {
  const base = resolveGenerationBaseUrl(backendUrl)

  if (/^https?:\/\//i.test(base)) {
    try {
      const url = new URL(base)
      const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      return `${protocol}//${url.host}${appendWebSocketPath(url.pathname)}`
    } catch (error) {
      console.error('Failed to parse backend URL for WebSocket:', error)
    }
  }

  const wsPath = appendWebSocketPath(base)

  if (typeof window === 'undefined') {
    return wsPath
  }

  const normalizedPath = wsPath.startsWith('/') ? wsPath : `/${wsPath}`
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}${normalizedPath}`
}

const isGenerationProgressMessage = (
  message: WebSocketMessage,
): message is GenerationProgressMessage => message.type === 'generation_progress'

const isGenerationCompleteMessage = (
  message: WebSocketMessage,
): message is GenerationCompleteMessage => message.type === 'generation_complete'

const isGenerationErrorMessage = (
  message: WebSocketMessage,
): message is GenerationErrorMessage => message.type === 'generation_error'

export const useGenerationUpdates = ({
  appStore,
  systemStatus,
  showHistory,
  configuredBackendUrl,
  logDebug,
  showToast,
}: UseGenerationUpdatesOptions): UseGenerationUpdatesReturn => {
  const { activeJobs, recentResults } = storeToRefs(appStore)

  const websocket = ref<WebSocket | null>(null)
  const pollInterval = ref<number | null>(null)

  const websocketUrl = computed<string>(() => resolveWebSocketUrl(configuredBackendUrl.value))
  const isConnected = computed<boolean>(() => websocket.value?.readyState === WebSocket.OPEN)

  const { fetchData: loadSystemStatus } = useSystemStatusApi()
  const { fetchData: loadActiveJobsDataApi } = useActiveJobsApi()
  const { fetchData: loadRecentResultsDataApi } = useRecentResultsApi(() => {
    const limit = showHistory.value ? 50 : 10
    return resolveBackendUrl(`/generation/results?limit=${limit}`, configuredBackendUrl.value)
  })

  const sortedActiveJobs: ComputedRef<GenerationJob[]> = computed(() => {
    const statusPriority: Record<string, number> = {
      processing: 0,
      queued: 1,
      completed: 2,
      failed: 3,
    }

    return [...activeJobs.value].sort((a, b) => {
      const aPriority = statusPriority[a.status] ?? 4
      const bPriority = statusPriority[b.status] ?? 4

      if (aPriority !== bPriority) {
        return aPriority - bPriority
      }

      const aCreated = parseTimestamp(a.created_at ?? a.startTime)
      const bCreated = parseTimestamp(b.created_at ?? b.startTime)

      return bCreated - aCreated
    })
  })

  const loadSystemStatusData = async (): Promise<void> => {
    try {
      const result = await loadSystemStatus()
      if (result) {
        const payload = result as SystemStatusPayload
        const { metrics: _metrics, message: _message, updated_at: _updatedAt, ...status } = payload
        systemStatus.value = {
          ...systemStatus.value,
          ...(status as Partial<SystemStatusState>),
        }
        appStore.updateSystemStatus(status as Partial<SystemStatusState>)
      }
    } catch (error) {
      console.error('Failed to load system status:', error)
    }
  }

  const loadActiveJobsData = async (): Promise<void> => {
    try {
      const result = await loadActiveJobsDataApi()
      if (Array.isArray(result)) {
        appStore.setActiveJobs(result)
      }
    } catch (error) {
      console.error('Failed to load active jobs:', error)
    }
  }

  const loadRecentResultsData = async (): Promise<void> => {
    try {
      const result = await loadRecentResultsDataApi()
      if (Array.isArray(result)) {
        appStore.setRecentResults(result)
      }
    } catch (error) {
      console.error('Failed to load recent results:', error)
    }
  }

  const updateJobProgress = (update: ProgressUpdate): void => {
    const job = activeJobs.value.find((item) => item.id === update.job_id)
    if (!job) {
      return
    }

    job.progress = normalizeProgress(update.progress)
    job.status = update.status as GenerationJob['status']

    if (typeof update.current_step === 'number') {
      job.current_step = update.current_step
    }

    if (typeof update.total_steps === 'number') {
      job.total_steps = update.total_steps
    }
  }

  const handleGenerationComplete = (data: Extract<WebSocketMessage, { type: 'generation_complete' }>): void => {
    appStore.removeJob(data.job_id)

    const createdAt = data.created_at ?? new Date().toISOString()
    const imageUrl = data.image_url ?? (Array.isArray(data.images) ? data.images[0] ?? null : null)

    const result: GenerationResult = {
      id: data.result_id ?? data.job_id,
      job_id: data.job_id,
      result_id: data.result_id,
      prompt: data.prompt,
      negative_prompt: data.negative_prompt,
      image_url: imageUrl,
      width: data.width,
      height: data.height,
      steps: data.steps,
      cfg_scale: data.cfg_scale,
      seed: data.seed ?? null,
      created_at: createdAt,
    }

    appStore.addResult(result)
    showToast('Generation completed successfully', 'success')
  }

  const handleGenerationError = (data: Extract<WebSocketMessage, { type: 'generation_error' }>): void => {
    appStore.removeJob(data.job_id)
    showToast(`Generation failed: ${data.error}`, 'error')
  }

  const handleWebSocketMessage = (event: MessageEvent): void => {
    try {
      const data = JSON.parse(event.data as string) as WebSocketMessage
      if (!data || typeof data !== 'object') {
        logDebug('Received invalid WebSocket message:', data)
        return
      }

      switch (data.type) {
        case 'generation_progress':
          if (isGenerationProgressMessage(data)) {
            updateJobProgress(data)
          }
          break
        case 'generation_complete':
          if (isGenerationCompleteMessage(data)) {
            handleGenerationComplete(data)
          }
          break
        case 'generation_error':
          if (isGenerationErrorMessage(data)) {
            handleGenerationError(data)
          }
          break
        case 'queue_update':
          if (Array.isArray(data.jobs)) {
            appStore.setActiveJobs(data.jobs)
          }
          break
        case 'system_status': {
          const { metrics: _metrics, message: _message, updated_at: _updatedAt, type: _type, ...status } = data
          systemStatus.value = {
            ...systemStatus.value,
            ...(status as Partial<SystemStatusState>),
          }
          appStore.updateSystemStatus(status as Partial<SystemStatusState>)
          break
        }
        case 'generation_started':
          logDebug('Generation job started', data.job_id)
          break
        default:
          logDebug('Unknown WebSocket message type:', (data as { type?: string }).type)
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
    }
  }

  const initWebSocket = (): void => {
    try {
      const wsUrl = websocketUrl.value

      if (websocket.value) {
        websocket.value.onclose = null
        websocket.value.close()
      }

      const connection = new WebSocket(wsUrl)
      websocket.value = connection

      connection.onopen = () => {
        logDebug('WebSocket connected for generation updates')
      }

      connection.onmessage = handleWebSocketMessage

      connection.onerror = (event) => {
        console.error('WebSocket error:', event)
      }

      connection.onclose = () => {
        logDebug('WebSocket connection closed')
        if (websocket.value === connection) {
          websocket.value = null
        }
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            if (!websocket.value) {
              initWebSocket()
            }
          }, 3000)
        }
      }
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error)
    }
  }

  const startPolling = (): void => {
    if (pollInterval.value || typeof window === 'undefined') {
      return
    }
    pollInterval.value = window.setInterval(async () => {
      if (activeJobs.value.length > 0) {
        await loadActiveJobsData()
      }
      await loadSystemStatusData()
    }, 2000)
  }

  const stopPolling = (): void => {
    if (pollInterval.value != null && typeof window !== 'undefined') {
      window.clearInterval(pollInterval.value)
      pollInterval.value = null
    }
  }

  const cleanup = (): void => {
    if (websocket.value) {
      websocket.value.onclose = null
      websocket.value.close()
      websocket.value = null
    }
    stopPolling()
  }

  const initialize = async (): Promise<void> => {
    await Promise.all([
      loadSystemStatusData(),
      loadActiveJobsData(),
      loadRecentResultsData(),
    ])

    initWebSocket()
    startPolling()
  }

  watch(showHistory, () => {
    void loadRecentResultsData()
  })

  watch(isConnected, (connected) => {
    logDebug('WebSocket connection state changed:', connected)
  })

  watch(websocketUrl, (newUrl, oldUrl) => {
    if (!newUrl || newUrl === oldUrl) {
      return
    }

    if (websocket.value) {
      const currentConnection = websocket.value
      currentConnection.onclose = null
      try {
        currentConnection.close()
      } catch (error) {
        console.error('Failed to close existing WebSocket connection:', error)
      } finally {
        websocket.value = null
      }
    }

    initWebSocket()
  })

  onUnmounted(() => {
    cleanup()
  })

  return {
    activeJobs,
    recentResults,
    sortedActiveJobs,
    isConnected,
    initialize,
    cleanup,
    loadSystemStatusData,
    loadActiveJobsData,
    loadRecentResultsData,
  }
}
