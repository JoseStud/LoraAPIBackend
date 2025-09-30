import { beforeEach, describe, expect, it } from 'vitest'
import type {
  GenerationRequestBody,
  GenerationRequestPayload,
} from '../../app/frontend/src/types'

import {
  cancelGenerationJob,
  deleteGenerationResult,
  downloadGenerationResult,
  requestGeneration,
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

const createGenerationRequestBody = (): GenerationRequestBody => ({
  ...createGenerationPayload(),
})

beforeEach(() => {
  const settingsStore = useSettingsStore()
  settingsStore.reset()

  fetch.mockClear()
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

    expect(fetch).toHaveBeenCalledWith(
      'https://external.example/api/generation/generate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(body) }),
    )
  })

  it('honours the configured backend URL for startGeneration', async () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: 'https://configured.example/api' })

    const payload = createGenerationPayload()
    await startGeneration(payload)

    expect(fetch).toHaveBeenCalledWith(
      'https://configured.example/api/generation/generate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    )
  })

  it('resolves cancelGenerationJob with override', async () => {
    await cancelGenerationJob('job-123', '/custom/api')

    expect(fetch).toHaveBeenCalledWith(
      '/custom/api/generation/jobs/job-123/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('resolves deleteGenerationResult via the configured store backend URL', async () => {
    const store = useSettingsStore()
    store.setSettings({ backendUrl: '/prefixed/api' })

    await deleteGenerationResult('result-9')

    expect(fetch).toHaveBeenCalledWith(
      '/prefixed/api/generation/results/result-9',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('resolves downloadGenerationResult using overrides', async () => {
    await downloadGenerationResult(5, undefined, 'https://download.example/api')

    expect(fetch).toHaveBeenCalledWith(
      'https://download.example/api/generation/results/5/download',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})
