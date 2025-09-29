import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cancelGenerationJob,
  deleteGenerationResult,
  downloadGenerationResult,
  requestGeneration,
  resolveBackendUrl,
  resolveGenerationBaseUrl,
  startGeneration,
} from '../../app/frontend/src/services/generation/generationService.ts'
import { useSettingsStore } from '../../app/frontend/src/stores/settings'
import type {
  GenerationCancelResponse,
  GenerationRequestBody,
  GenerationRequestPayload,
  GenerationStartResponse,
  SDNextGenerationResult,
} from '../../app/frontend/src/types'

const mocks = vi.hoisted(() => ({
  postJson: vi.fn(),
  requestJson: vi.fn(),
  deleteRequest: vi.fn(),
  requestBlob: vi.fn(),
}))

vi.mock('../../app/frontend/src/services/apiClient.ts', async () => {
  const actual = await vi.importActual<typeof import('../../app/frontend/src/services/apiClient.ts')>(
    '../../app/frontend/src/services/apiClient.ts'
  )
  return {
    ...actual,
    postJson: mocks.postJson,
    requestJson: mocks.requestJson,
    deleteRequest: mocks.deleteRequest,
    requestBlob: mocks.requestBlob,
  }
})

const defaultResult: SDNextGenerationResult = {
  job_id: 'job-1',
  status: 'queued',
  images: [],
  progress: 0,
  generation_info: null,
}

const defaultStartResponse: GenerationStartResponse = { ...defaultResult }

const defaultCancelResponse: GenerationCancelResponse = {
  success: true,
  status: 'cancelled',
  message: null,
}

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

const createGenerationRequestBody = (): GenerationRequestBody => ({
  ...createGenerationPayload(),
})

beforeEach(() => {
  const settingsStore = useSettingsStore()
  settingsStore.reset()

  mocks.postJson.mockReset()
  mocks.requestJson.mockReset()
  mocks.deleteRequest.mockReset()
  mocks.requestBlob.mockReset()

  mocks.postJson.mockResolvedValue({
    data: defaultStartResponse,
    meta: { ok: true, status: 200, statusText: 'OK' },
  })

  mocks.requestJson.mockResolvedValue({
    data: defaultCancelResponse,
    meta: { ok: true, status: 200, statusText: 'OK' },
  })

  mocks.deleteRequest.mockResolvedValue({
    data: null,
    meta: { ok: true, status: 204, statusText: 'No Content' },
  })

  const blob = new Blob(['payload'])
  const response = {
    headers: {
      get: vi.fn((header: string) => {
        if (header === 'content-type') {
          return 'image/png'
        }
        return null
      }),
    },
  } as unknown as Response

  mocks.requestBlob.mockResolvedValue({ blob, response })
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
  it('uses the provided override for requestGeneration', async () => {
    const body = createGenerationRequestBody()

    await requestGeneration(body, 'https://external.example/api')

    expect(mocks.postJson).toHaveBeenCalledWith(
      'https://external.example/api/generation/generate',
      body,
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })

  it('honours the configured backend URL for startGeneration', async () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: 'https://configured.example/api' })

    const payload = createGenerationPayload()
    await startGeneration(payload)

    expect(mocks.postJson).toHaveBeenCalledWith(
      'https://configured.example/api/generation/generate',
      payload,
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })

  it('resolves cancelGenerationJob with override', async () => {
    await cancelGenerationJob('job-123', '/custom/api')

    expect(mocks.requestJson).toHaveBeenCalledWith(
      '/custom/api/generation/jobs/job-123/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('resolves deleteGenerationResult via the configured store backend URL', async () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: '/prefixed/api' })

    await deleteGenerationResult('result-9')

    expect(mocks.deleteRequest).toHaveBeenCalledWith(
      '/prefixed/api/generation/results/result-9',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })

  it('resolves downloadGenerationResult using overrides', async () => {
    await downloadGenerationResult(5, undefined, 'https://download.example/api')

    expect(mocks.requestBlob).toHaveBeenCalledWith(
      'https://download.example/api/generation/results/5/download',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })
})
