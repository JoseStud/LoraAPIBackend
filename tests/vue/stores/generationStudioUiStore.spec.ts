import { describe, expect, it } from 'vitest'

import { createGenerationStudioUiVm } from '@/features/generation/stores/ui'
import type { GenerationResult } from '@/types'

describe('generation studio ui view model', () => {
  it('tracks modal visibility alongside the selected result', () => {
    const vm = createGenerationStudioUiVm()
    const result = { id: '1' } as unknown as GenerationResult

    expect(vm.showModal.value).toBe(false)
    expect(vm.selectedResult.value).toBeNull()

    vm.selectResult(result)

    expect(vm.showModal.value).toBe(true)
    expect(vm.selectedResult.value).toEqual(result)

    vm.setShowModal(false)

    expect(vm.showModal.value).toBe(false)
    expect(vm.selectedResult.value).toBeNull()

    vm.dispose()
  })

  it('resets ui state independently from other instances', () => {
    const firstVm = createGenerationStudioUiVm()
    const secondVm = createGenerationStudioUiVm()

    firstVm.setShowHistory(true)
    firstVm.selectResult({ id: '2' } as unknown as GenerationResult)

    expect(secondVm.showHistory.value).toBe(false)
    expect(secondVm.showModal.value).toBe(false)
    expect(secondVm.selectedResult.value).toBeNull()

    firstVm.reset()

    expect(firstVm.showHistory.value).toBe(false)
    expect(firstVm.showModal.value).toBe(false)
    expect(firstVm.selectedResult.value).toBeNull()

    firstVm.dispose()
    secondVm.dispose()
  })
})
