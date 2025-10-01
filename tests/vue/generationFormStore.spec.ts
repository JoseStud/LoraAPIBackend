import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useGenerationFormStore } from '@/features/generation/stores/form'
import type { GenerationResult } from '@/types'

describe('useGenerationFormStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('updates the prompt through setPrompt', () => {
    const store = useGenerationFormStore()

    store.setPrompt('new prompt')

    expect(store.params.prompt).toBe('new prompt')
  })

  it('updates dimensions through setDimensions', () => {
    const store = useGenerationFormStore()

    store.setDimensions({ width: 768 })
    expect(store.params.width).toBe(768)
    expect(store.params.height).toBe(512)

    store.setDimensions({ height: 640 })
    expect(store.params.width).toBe(768)
    expect(store.params.height).toBe(640)
  })

  it('applies parameters from a generation result', () => {
    const store = useGenerationFormStore()

    const result: Partial<GenerationResult> = {
      prompt: 'applied prompt',
      negative_prompt: 'neg prompt',
      width: 1024,
      height: 512,
      steps: 30,
      cfg_scale: 11,
      seed: 42,
    }

    store.applyResultParameters(result as GenerationResult)

    expect(store.params.prompt).toBe('applied prompt')
    expect(store.params.negative_prompt).toBe('neg prompt')
    expect(store.params.width).toBe(1024)
    expect(store.params.height).toBe(512)
    expect(store.params.steps).toBe(30)
    expect(store.params.cfg_scale).toBe(11)
    expect(store.params.seed).toBe(42)
  })

  it('falls back to an empty negative prompt when result has no value', () => {
    const store = useGenerationFormStore()
    store.updateParams({ negative_prompt: 'existing' })

    store.applyResultParameters({} as GenerationResult)

    expect(store.params.negative_prompt).toBe('')
  })
})
