import { ref } from 'vue'
import { defineStore } from 'pinia'

import type { GenerationResult } from '@/types'

export const useGenerationStudioUiStore = defineStore('generation-studio-ui', () => {
  const showHistory = ref(false)
  const showModal = ref(false)
  const selectedResult = ref<GenerationResult | null>(null)

  const setShowHistory = (value: boolean): void => {
    showHistory.value = value
  }

  const toggleHistory = (): void => {
    showHistory.value = !showHistory.value
  }

  const setShowModal = (value: boolean): void => {
    showModal.value = value

    if (!value) {
      selectedResult.value = null
    }
  }

  const selectResult = (result: GenerationResult | null): void => {
    selectedResult.value = result
    showModal.value = result != null
  }

  const reset = (): void => {
    showHistory.value = false
    showModal.value = false
    selectedResult.value = null
  }

  return {
    showHistory,
    showModal,
    selectedResult,
    setShowHistory,
    toggleHistory,
    setShowModal,
    selectResult,
    reset,
  }
})

export type GenerationStudioUiStore = ReturnType<typeof useGenerationStudioUiStore>
