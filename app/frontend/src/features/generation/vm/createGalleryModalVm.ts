import { effectScope, onScopeDispose, readonly, ref, type Ref } from 'vue'

import type { GenerationResult } from '@/types'

type ModalReadonlyRef<T> = Readonly<Ref<T>>

export interface GenerationGalleryModalVm {
  isOpen: ModalReadonlyRef<boolean>
  selectedResult: ModalReadonlyRef<GenerationResult | null>
  open(result: GenerationResult): void
  close(): void
  dispose(): void
}

export const createGalleryModalVm = (): GenerationGalleryModalVm => {
  const scope = effectScope()

  const isOpen = ref(false)
  const selectedResult = ref<GenerationResult | null>(null)

  const isOpenReadonly = readonly(isOpen) as ModalReadonlyRef<boolean>
  const selectedResultReadonly = readonly(selectedResult) as ModalReadonlyRef<GenerationResult | null>

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

  scope.run(() => {
    onScopeDispose(() => {
      reset()
    })
  })

  const dispose = (): void => {
    scope.stop()
  }

  return {
    isOpen: isOpenReadonly,
    selectedResult: selectedResultReadonly,
    open,
    close,
    dispose,
  }
}
