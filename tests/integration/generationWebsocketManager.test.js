import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

import { useGenerationStore } from '../../app/frontend/src/stores/generation'

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
  let store
  let notifications
  const originalWebSocket = globalThis.WebSocket

  beforeEach(() => {
    MockWebSocket.instances = []
    vi.restoreAllMocks()
    globalThis.WebSocket = vi.fn((url) => new MockWebSocket(url))

    setActivePinia(createPinia())
    store = useGenerationStore()
    notifications = {
      notify: vi.fn(),
      debug: vi.fn(),
    }

    store.configureGenerationServices({
      getBackendUrl: () => 'http://localhost:8000',
      notificationAdapter: notifications,
      queueClient: {
        startGeneration: vi.fn(),
        cancelJob: vi.fn(),
        deleteResult: vi.fn(),
        fetchSystemStatus: vi.fn(),
        fetchActiveJobs: vi.fn(),
        fetchRecentResults: vi.fn(),
      },
    })
  })

  afterEach(() => {
    store.stopUpdates()
    globalThis.WebSocket = originalWebSocket
  })

  it('routes websocket messages into the generation store', () => {
    const manager = store.getWebSocketManager()
    manager.start()

    expect(MockWebSocket.instances).toHaveLength(1)
    const socket = MockWebSocket.instances[0]

    socket.onopen?.()
    expect(store.isConnected).toBe(true)

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

    expect(store.activeJobs).toHaveLength(1)
    expect(store.activeJobs[0]).toMatchObject({ id: 'job-ws-1', status: 'processing' })

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

    expect(store.systemStatus.status).toBe('degraded')
    expect(store.systemStatus.queue_length).toBe(3)

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

    expect(store.recentResults[0]).toMatchObject({ id: 'result-ws-1', job_id: 'job-ws-1' })
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
    expect(store.isConnected).toBe(false)
  })
})
