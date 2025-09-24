import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia, storeToRefs } from 'pinia'

import { createGenerationOrchestrator } from '../../app/frontend/src/services/generation/orchestrator'
import {
  useGenerationQueueStore,
  useGenerationResultsStore,
  useGenerationConnectionStore,
} from '../../app/frontend/src/stores/generation'

class MockWebSocket {
  static instances = []

  constructor(url) {
    this.url = url
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    this.close = vi.fn()
    this.readyState = 1
    MockWebSocket.instances.push(this)
  }
}

describe('generation websocket manager integration', () => {
  let notifications
  let orchestrator
  const originalWebSocket = globalThis.WebSocket
  let queueClient

  beforeEach(() => {
    MockWebSocket.instances = []
    vi.restoreAllMocks()
    globalThis.WebSocket = vi.fn((url) => new MockWebSocket(url))

    setActivePinia(createPinia())
    notifications = {
      notify: vi.fn(),
      debug: vi.fn(),
    }

    queueClient = {
      startGeneration: vi.fn(),
      cancelJob: vi.fn(),
      deleteResult: vi.fn(),
      fetchSystemStatus: vi.fn().mockResolvedValue({
        status: 'healthy',
        queue_length: 0,
        gpu_available: true,
        gpu_status: 'Available',
        memory_total: 8192,
        memory_used: 0,
      }),
      fetchActiveJobs: vi.fn().mockResolvedValue([]),
      fetchRecentResults: vi.fn().mockResolvedValue([]),
    }

    const showHistory = ref(false)
    const configuredBackendUrl = ref('http://localhost:8000')

    const queueStore = useGenerationQueueStore()
    const resultsStore = useGenerationResultsStore()
    const connectionStore = useGenerationConnectionStore()
    const { historyLimit } = storeToRefs(resultsStore)
    const { pollIntervalMs } = storeToRefs(connectionStore)

    orchestrator = createGenerationOrchestrator({
      showHistory,
      configuredBackendUrl,
      notificationAdapter: notifications,
      queueStore,
      resultsStore,
      connectionStore,
      historyLimit,
      pollIntervalMs,
      queueClient,
    })
  })

  afterEach(() => {
    orchestrator.cleanup()
    globalThis.WebSocket = originalWebSocket
  })

  it('routes websocket messages through the generation stores', async () => {
    const queueStore = useGenerationQueueStore()
    const resultStore = useGenerationResultsStore()
    const connectionStore = useGenerationConnectionStore()

    await orchestrator.initialize()

    expect(MockWebSocket.instances).toHaveLength(1)
    const socket = MockWebSocket.instances[0]

    socket.onopen?.()
    expect(connectionStore.isConnected).toBe(true)

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'queue_update',
        jobs: [
          {
            id: 'job-ws-1',
            status: 'processing',
            progress: 25,
          },
        ],
      }),
    })

    expect(queueStore.activeJobs).toHaveLength(1)
    expect(queueStore.activeJobs[0]).toMatchObject({ id: 'job-ws-1', status: 'processing' })

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'system_status',
        status: 'degraded',
        queue_length: 3,
        gpu_available: true,
        gpu_status: 'Busy',
        memory_total: 16384,
        memory_used: 4096,
      }),
    })

    expect(connectionStore.systemStatus.status).toBe('degraded')
    expect(connectionStore.systemStatus.queue_length).toBe(3)

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'generation_complete',
        job_id: 'job-ws-1',
        result_id: 'result-ws-1',
        prompt: 'ws prompt',
        negative_prompt: null,
        image_url: 'http://example.com/ws.png',
        width: 256,
        height: 256,
        steps: 10,
        cfg_scale: 7,
        seed: 1,
        created_at: new Date().toISOString(),
      }),
    })

    expect(resultStore.recentResults[0]).toMatchObject({ id: 'result-ws-1', job_id: 'job-ws-1' })
    expect(notifications.notify).toHaveBeenCalledWith('Generation completed successfully', 'success')

    socket.onmessage?.({
      data: JSON.stringify({
        type: 'generation_error',
        job_id: 'job-ws-2',
        error: 'something failed',
      }),
    })

    expect(notifications.notify).toHaveBeenCalledWith(
      expect.stringContaining('Generation failed: something failed'),
      'error',
    )

    socket.onclose?.()
    expect(connectionStore.isConnected).toBe(false)
  })
})
