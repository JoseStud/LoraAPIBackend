import { computed, onMounted, onUnmounted, ref, watch, type ComputedRef } from 'vue'
import { storeToRefs } from 'pinia'

import { useActiveJobsApi, useRecentResultsApi, useSystemStatusApi } from '@/composables/apiClients'
import {
  cancelGenerationJob,
  deleteGenerationResult,
  resolveBackendUrl,
  resolveGenerationBaseUrl,
  startGeneration as startGenerationRequest,
  toGenerationRequestPayload,
} from '@/services/generationService'
import { useAppStore } from '@/stores/app'
import { useSettingsStore } from '@/stores/settings'
import type {
  GenerationCompleteMessage,
  GenerationErrorMessage,
  GenerationFormState,
  GenerationJob,
  GenerationProgressMessage,
  GenerationResult,
  NotificationType,
  ProgressUpdate,
  SystemStatusPayload,
  SystemStatusState,
  WebSocketMessage,
} from '@/types'

export const useGenerationStudio = () => {
  const appStore = useAppStore()
  const { activeJobs, recentResults } = storeToRefs(appStore)
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

  const websocket = ref<WebSocket | null>(null)
  const pollInterval = ref<number | null>(null)
  const isConnected = computed<boolean>(() => websocket.value?.readyState === WebSocket.OPEN)

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

  const websocketUrl = computed<string>(() => resolveWebSocketUrl(configuredBackendUrl.value))

  const logDebug = (...args: unknown[]): void => {
    if (import.meta.env.DEV) {
      console.info('[GenerationStudio]', ...args)
    }
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

  const isGenerationProgressMessage = (
    message: WebSocketMessage,
  ): message is GenerationProgressMessage => message.type === 'generation_progress'

  const isGenerationCompleteMessage = (
    message: WebSocketMessage,
  ): message is GenerationCompleteMessage => message.type === 'generation_complete'

  const isGenerationErrorMessage = (
    message: WebSocketMessage,
  ): message is GenerationErrorMessage => message.type === 'generation_error'

  const { fetchData: loadSystemStatus } = useSystemStatusApi()
  const { fetchData: loadActiveJobsData } = useActiveJobsApi()
  const { fetchData: loadRecentResultsData } = useRecentResultsApi(() => {
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

  const loadActiveJobsDataFn = async (): Promise<void> => {
    try {
      const result = await loadActiveJobsData()
      if (Array.isArray(result)) {
        appStore.setActiveJobs(result)
      }
    } catch (error) {
      console.error('Failed to load active jobs:', error)
    }
  }

  const loadRecentResultsDataFn = async (): Promise<void> => {
    try {
      const result = await loadRecentResultsData()
      if (Array.isArray(result)) {
        appStore.setRecentResults(result)
      }
    } catch (error) {
      console.error('Failed to load recent results:', error)
    }
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
    if (pollInterval.value) {
      return
    }
    pollInterval.value = window.setInterval(async () => {
      if (activeJobs.value.length > 0) {
        await loadActiveJobsDataFn()
      }
      await loadSystemStatusData()
    }, 2000)
  }

  const stopPolling = (): void => {
    if (pollInterval.value != null) {
      window.clearInterval(pollInterval.value)
      pollInterval.value = null
    }
  }

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
    await loadRecentResultsDataFn()
    showToast('Results refreshed', 'success')
  }

  const loadFromComposer = (): void => {
    try {
      const composerData = localStorage.getItem('composerPrompt')
      if (composerData) {
        params.value.prompt = composerData
        showToast('Loaded prompt from composer', 'success')
      } else {
        showToast('No composer data found', 'warning')
      }
    } catch (error) {
      console.error('Error loading composer data:', error)
    }
  }

  const useRandomPrompt = (): void => {
    const randomPrompts: readonly string[] = [
      'a beautiful anime girl with long flowing hair',
      'a majestic dragon soaring through cloudy skies',
      'a cyberpunk cityscape with neon lights',
      'a serene landscape with mountains and a lake',
      'a cute robot in a futuristic laboratory',
      'a magical forest with glowing mushrooms',
      'a space station orbiting a distant planet',
      'a steampunk airship flying over Victorian city',
    ]

    const index = Math.floor(Math.random() * randomPrompts.length)
    params.value.prompt = randomPrompts[index]
    showToast('Random prompt generated', 'success')
  }

  const savePreset = (): void => {
    const presetName = window.prompt('Enter a name for this preset:')
    if (!presetName) {
      return
    }

    const preset = {
      name: presetName,
      params: { ...params.value },
      created_at: new Date().toISOString(),
    }

    try {
      const savedPresets = JSON.parse(localStorage.getItem('generationPresets') ?? '[]') as unknown[]
      savedPresets.push(preset)
      localStorage.setItem('generationPresets', JSON.stringify(savedPresets))
      showToast(`Preset "${presetName}" saved`, 'success')
    } catch (error) {
      console.error('Failed to save preset:', error)
      showToast('Failed to save preset', 'error')
    }
  }

  const loadSavedParams = (): void => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const prompt = urlParams.get('prompt')
      if (typeof prompt === 'string') {
        params.value.prompt = prompt
      }

      const saved = localStorage.getItem('generation_params')
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<GenerationFormState>
        Object.assign(params.value, parsed)
      }
    } catch (error) {
      console.error('Error loading saved parameters:', error)
    }
  }

  const saveParams = (value: GenerationFormState = params.value): void => {
    try {
      localStorage.setItem('generation_params', JSON.stringify(value))
    } catch (error) {
      console.error('Error saving parameters:', error)
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

  const showToast = (message: string, type: NotificationType = 'success'): void => {
    logDebug(`[${type.toUpperCase()}] ${message}`)
    appStore.addNotification(message, type)
  }

  watch(showHistory, () => {
    void loadRecentResultsDataFn()
  })

  watch(params, (newParams) => {
    saveParams(newParams)
  }, { deep: true })

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

  onMounted(async () => {
    logDebug('Initializing Generation Studio composable...')

    await Promise.all([
      loadSystemStatusData(),
      loadActiveJobsDataFn(),
      loadRecentResultsDataFn(),
    ])

    initWebSocket()
    startPolling()
    loadSavedParams()
  })

  onUnmounted(() => {
    cleanup()
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
