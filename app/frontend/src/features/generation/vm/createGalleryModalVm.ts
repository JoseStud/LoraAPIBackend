import { effectScope, onScopeDispose, readonly, ref } from 'vue'

import type { GenerationResult } from '@/types'

import type { ReadonlyRef } from './createStudioVm'

export interface GenerationGalleryModalVm {
  isOpen: ReadonlyRef<boolean>
  selectedResult: ReadonlyRef<GenerationResult | null>
  open(result: GenerationResult): void
  close(): void
  dispose(): void
}

export const createGalleryModalVm = (): GenerationGalleryModalVm => {
  const scope = effectScope()

  const vm = scope.run(() => {
    const isOpen = ref(false)
    const selectedResult = ref<GenerationResult | null>(null)

    const open = (result: GenerationResult): void => {
      selectedResult.value = result
      isOpen.value = true
    }

    const close = (): void => {
      isOpen.value = false
      selectedResult.value = null
    }

    const reset = (): void => {
      isOpen.value = false
      selectedResult.value = null
    }

    onScopeDispose(() => {
      reset()
    })

    const isOpenReadonly = readonly(isOpen) as ReadonlyRef<boolean>
    const selectedResultReadonly =
      readonly(selectedResult) as ReadonlyRef<GenerationResult | null>

    return {
      isOpen: isOpenReadonly,
      selectedResult: selectedResultReadonly,
      open,
      close,
    }
  })

  if (!vm) {
    throw new Error('Failed to create generation gallery modal VM')
  }

  const dispose = (): void => {
    scope.stop()
  }

  return {
    ...vm,
    dispose,
  }
}
