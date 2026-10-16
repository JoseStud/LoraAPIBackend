import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GenerationRequestPayload } from '@/types'

import {
  cancelGenerationJob,
  deleteGenerationResult,
  resolveBackendUrl,
  resolveGenerationBaseUrl,
  startGeneration,
} from '@/features/generation/services/generationService'
import { useSettingsStore } from '@/stores/settings'

const createGenerationPayload = (): GenerationRequestPayload => ({
  prompt: 'test',
  negative_prompt: null,
  steps: 20,
  sampler_name: 'DPM++ 2M',
  cfg_scale: 7,
  width: 512,
  height: 512,
  seed: -1,
  batch_size: 1,
  n_iter: 1,
  denoising_strength: null,
})

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// Answers the generation endpoints these tests call, whatever base URL they resolve against.
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const method = init?.method ?? 'GET'

  if (method === 'POST' && url.endsWith('/generation/queue-generation')) {
    return jsonResponse({ delivery_id: 'job-1' })
  }
  if (method === 'POST' && /\/generation\/jobs\/[^/]+\/cancel$/.test(url)) {
    return jsonResponse({ success: true, status: 'cancelled' })
  }
  if (method === 'DELETE' && /\/generation\/results\/[^/]+$/.test(url)) {
    return new Response(null, { status: 204 })
  }
  return jsonResponse({ detail: `Unhandled ${method} ${url}` }, 404)
})

beforeEach(() => {
  const settingsStore = useSettingsStore()
  settingsStore.reset()

  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveBackendUrl', () => {
  it('uses the default base when no configuration is provided', () => {
    expect(resolveBackendUrl('/generation/generate')).toBe('/api/v1/generation/generate')
  })

  it('uses the configured backend URL from the settings store', () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: 'https://custom.example/api/v2/' })

    expect(resolveBackendUrl('/generation/generate')).toBe(
      'https://custom.example/api/v2/generation/generate',
    )
  })

  it('normalises relative overrides', () => {
    expect(resolveBackendUrl('/generation/generate', 'custom/prefix/')).toBe(
      '/custom/prefix/generation/generate',
    )
  })

  it('prefers explicit overrides when provided', () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: '/ignored' })

    expect(resolveBackendUrl('/generation/generate', 'https://override.example/base')).toBe(
      'https://override.example/base/generation/generate',
    )
  })

  it('preserves query strings when resolving URLs', () => {
    expect(resolveBackendUrl('/generation/results?limit=10')).toBe(
      '/api/v1/generation/results?limit=10',
    )
  })

  it('exposes a helper for resolving the base URL only', () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: '/prefixed/api' })

    expect(resolveGenerationBaseUrl()).toBe('/prefixed/api/generation')
  })

  it('resolves an absolute backend base when the frontend origin differs', () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: 'https://remote.example/api/v3/' })

    expect(resolveGenerationBaseUrl()).toBe('https://remote.example/api/v3/generation')
    expect(resolveBackendUrl('/generation/jobs/active')).toBe(
      'https://remote.example/api/v3/generation/jobs/active',
    )
  })
})

describe('generationService URL resolution', () => {
  it('honours the configured backend URL for startGeneration', async () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: 'https://configured.example/api' })

    const payload = createGenerationPayload()
    await startGeneration(payload)

    expect(fetchMock).toHaveBeenCalledWith(
      'https://configured.example/api/generation/queue-generation',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    )
  })

  it('queues the job and reports it as queued', async () => {
    const response = await startGeneration(createGenerationPayload(), '/api')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/generation/queue-generation',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(response).toEqual({ job_id: 'job-1', status: 'queued', progress: 0 })
  })

  it('resolves cancelGenerationJob with override', async () => {
    await cancelGenerationJob('job-123', '/custom/api')

    expect(fetchMock).toHaveBeenCalledWith(
      '/custom/api/generation/jobs/job-123/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('resolves deleteGenerationResult via the configured store backend URL', async () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: '/prefixed/api' })

    await deleteGenerationResult('result-9')

    expect(fetchMock).toHaveBeenCalledWith(
      '/prefixed/api/generation/results/result-9',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
