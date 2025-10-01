import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useGenerationStudioUiStore } from '@/features/generation/stores/ui'
import type { GenerationResult } from '@/types'

describe('generation studio ui store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('tracks modal visibility alongside the selected result', () => {
    const store = useGenerationStudioUiStore()
    const result = { id: '1' } as unknown as GenerationResult

    expect(store.showModal).toBe(false)
    expect(store.selectedResult).toBeNull()

    store.selectResult(result)

    expect(store.showModal).toBe(true)
    expect(store.selectedResult).toBe(result)

    store.setShowModal(false)

    expect(store.showModal).toBe(false)
    expect(store.selectedResult).toBeNull()
  })

  it('resets ui state independently from form data', () => {
    const store = useGenerationStudioUiStore()

    store.setShowHistory(true)
    store.selectResult({ id: '2' } as unknown as GenerationResult)

    store.reset()

    expect(store.showHistory).toBe(false)
    expect(store.showModal).toBe(false)
    expect(store.selectedResult).toBeNull()
  })
})
