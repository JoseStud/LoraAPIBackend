import { effectScope, onScopeDispose, readonly, ref, type Ref } from 'vue'

export type ReadonlyRef<T> = Readonly<Ref<T>>

export interface GenerationStudioVm {
  showHistory: ReadonlyRef<boolean>
  setShowHistory(value: boolean): void
  toggleHistory(): void
  reset(): void
  dispose(): void
}

export const createStudioVm = (initialShowHistory = false): GenerationStudioVm => {
  const scope = effectScope()

  const vm = scope.run(() => {
    const showHistory = ref(initialShowHistory)

    const setShowHistory = (value: boolean): void => {
      showHistory.value = value
    }

    const toggleHistory = (): void => {
      showHistory.value = !showHistory.value
    }

    const reset = (): void => {
      showHistory.value = initialShowHistory
    }

    onScopeDispose(() => {
      reset()
    })

    return {
      showHistory: readonly(showHistory),
      setShowHistory,
      toggleHistory,
      reset,
    }
  })

  if (!vm) {
    throw new Error('Failed to create generation studio VM')
  }

  const dispose = (): void => {
    scope.stop()
  }

  return {
    ...vm,
    dispose,
  }
}

export type { GenerationStudioVm as GenerationStudioUiStore }
