import { describe, expect, it } from 'vitest'

import { createGalleryModalVm } from '@/features/generation/vm/createGalleryModalVm'
import { createStudioVm } from '@/features/generation/vm/createStudioVm'
import type { GenerationResult } from '@/types'

describe('generation studio view models', () => {
  it('tracks modal visibility alongside the selected result', () => {
    const galleryVm = createGalleryModalVm()
    const result = { id: '1' } as unknown as GenerationResult

    expect(galleryVm.isOpen.value).toBe(false)
    expect(galleryVm.selectedResult.value).toBeNull()

    galleryVm.open(result)

    expect(galleryVm.isOpen.value).toBe(true)
    expect(galleryVm.selectedResult.value).toEqual(result)

    galleryVm.close()

    expect(galleryVm.isOpen.value).toBe(false)
    expect(galleryVm.selectedResult.value).toBeNull()

    galleryVm.dispose()
  })

  it('isolates history visibility state per instance', () => {
    const firstVm = createStudioVm()
    const secondVm = createStudioVm()

    firstVm.setShowHistory(true)

    expect(firstVm.showHistory.value).toBe(true)
    expect(secondVm.showHistory.value).toBe(false)

    firstVm.toggleHistory()

    expect(firstVm.showHistory.value).toBe(false)
    expect(secondVm.showHistory.value).toBe(false)

    firstVm.dispose()
    secondVm.dispose()
  })
})
