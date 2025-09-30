import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, storeToRefs } from 'pinia'

import { useGenerationUI } from '@/composables/generation/useGenerationUI'
import {
  useGenerationFormStore,
  useGenerationResultsStore,
  useGenerationStudioUiStore,
} from '@/stores/generation'
import type { GenerationResult } from '@/types'

describe('useGenerationUI', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useGenerationFormStore().reset()
    useGenerationStudioUiStore().reset()
    useGenerationResultsStore().reset()
  })

  it('applies parameters through the store when reusing results', () => {
    const notify = vi.fn()
    const formStore = useGenerationFormStore()
    const applySpy = vi.spyOn(formStore, 'applyResultParameters')
    const ui = useGenerationUI({ notify })

    const result: Partial<GenerationResult> = {
      prompt: 'stored prompt',
      width: 960,
    }

    ui.reuseParameters(result as GenerationResult)

    expect(applySpy).toHaveBeenCalledWith(result)
    expect(notify).toHaveBeenCalledWith('Parameters loaded from result', 'success')
  })

  it('clears the modal when hiding image modal', () => {
    const notify = vi.fn()
    const uiStore = useGenerationStudioUiStore()
    const { showModal, selectedResult } = storeToRefs(uiStore)
    const ui = useGenerationUI({ notify })

    const result = {
      id: 'test',
      prompt: 'prompt',
      thumbnail_url: 'example',
      status: 'completed',
    } as unknown as GenerationResult

    ui.showImageModal(result)
    expect(selectedResult.value).not.toBeNull()

    ui.hideImageModal()

    expect(showModal.value).toBe(false)
    expect(selectedResult.value).toBeNull()
  })
})
