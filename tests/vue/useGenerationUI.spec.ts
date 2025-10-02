import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

import { useGenerationUI } from '@/composables/generation/useGenerationUI'
import { useGenerationFormStore } from '@/features/generation/stores/form'
import { useGenerationOrchestratorStore } from '@/features/generation/stores/useGenerationOrchestratorStore'
import { createGenerationStudioUiVm } from '@/features/generation/stores/ui'
import type { GenerationResult } from '@/types'

describe('useGenerationUI', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useGenerationFormStore().reset()
    useGenerationOrchestratorStore().resetState()
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
    const vm = createGenerationStudioUiVm()
    const ui = useGenerationUI({ notify, vm })

    const result = {
      id: 'test',
      prompt: 'prompt',
      thumbnail_url: 'example',
      status: 'completed',
    } as unknown as GenerationResult

    ui.showImageModal(result)
    expect(vm.selectedResult.value).not.toBeNull()

    ui.hideImageModal()

    expect(vm.showModal.value).toBe(false)
    expect(vm.selectedResult.value).toBeNull()

    vm.dispose()
  })
})
