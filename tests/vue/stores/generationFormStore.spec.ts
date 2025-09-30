import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useGenerationFormStore } from '@/features/generation/stores'
import type { GenerationResult } from '@/types'

describe('generation form store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('maps generation results to form state', () => {
    const store = useGenerationFormStore()
    const initialParams = store.params

    const result: GenerationResult = {
      id: 'result-1',
      prompt: 'A scenic mountain landscape',
      negative_prompt: 'low quality, blurry',
      width: 768,
      height: 512,
      steps: 30,
      cfg_scale: 12,
      seed: 42,
    }

    store.applyResultParameters(result)

    expect(store.params).not.toBe(initialParams)
    expect(store.params.prompt).toBe(result.prompt)
    expect(store.params.negative_prompt).toBe(result.negative_prompt)
    expect(store.params.width).toBe(result.width)
    expect(store.params.height).toBe(result.height)
    expect(store.params.steps).toBe(result.steps)
    expect(store.params.cfg_scale).toBe(result.cfg_scale)
    expect(store.params.seed).toBe(result.seed)
  })

  it('resets missing values to defaults while preserving existing ones', () => {
    const store = useGenerationFormStore()

    store.updateParams({
      prompt: 'keep me',
      steps: 35,
      negative_prompt: 'should be cleared',
    })

    const result: GenerationResult = {
      id: 'result-2',
      width: 1024,
      height: 768,
      negative_prompt: null,
    }

    store.applyResultParameters(result)

    expect(store.params.prompt).toBe('keep me')
    expect(store.params.steps).toBe(35)
    expect(store.params.width).toBe(1024)
    expect(store.params.height).toBe(768)
    expect(store.params.negative_prompt).toBe('')
  })
})
