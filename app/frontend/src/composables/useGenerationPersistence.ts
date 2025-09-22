import { watch, type Ref } from 'vue'

import type { GenerationFormState, NotificationType } from '@/types'

const RANDOM_PROMPTS: readonly string[] = [
  'a beautiful anime girl with long flowing hair',
  'a majestic dragon soaring through cloudy skies',
  'a cyberpunk cityscape with neon lights',
  'a serene landscape with mountains and a lake',
  'a cute robot in a futuristic laboratory',
  'a magical forest with glowing mushrooms',
  'a space station orbiting a distant planet',
  'a steampunk airship flying over Victorian city',
]

interface UseGenerationPersistenceOptions {
  params: Ref<GenerationFormState>
  showToast: (message: string, type?: NotificationType) => void
}

export interface UseGenerationPersistenceReturn {
  loadSavedParams: () => void
  saveParams: (value?: GenerationFormState) => void
  savePreset: () => void
  loadFromComposer: () => void
  useRandomPrompt: () => void
}

export const useGenerationPersistence = ({
  params,
  showToast,
}: UseGenerationPersistenceOptions): UseGenerationPersistenceReturn => {
  const loadSavedParams = (): void => {
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const prompt = urlParams.get('prompt')
      if (typeof prompt === 'string') {
        params.value.prompt = prompt
      }

      const saved = localStorage.getItem('generation_params')
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<GenerationFormState>
        Object.assign(params.value, parsed)
      }
    } catch (error) {
      console.error('Error loading saved parameters:', error)
    }
  }

  const saveParams = (value: GenerationFormState = params.value): void => {
    try {
      localStorage.setItem('generation_params', JSON.stringify(value))
    } catch (error) {
      console.error('Error saving parameters:', error)
    }
  }

  const savePreset = (): void => {
    const presetName = window.prompt('Enter a name for this preset:')
    if (!presetName) {
      return
    }

    const preset = {
      name: presetName,
      params: { ...params.value },
      created_at: new Date().toISOString(),
    }

    try {
      const savedPresets = JSON.parse(localStorage.getItem('generationPresets') ?? '[]') as unknown[]
      savedPresets.push(preset)
      localStorage.setItem('generationPresets', JSON.stringify(savedPresets))
      showToast(`Preset "${presetName}" saved`, 'success')
    } catch (error) {
      console.error('Failed to save preset:', error)
      showToast('Failed to save preset', 'error')
    }
  }

  const loadFromComposer = (): void => {
    try {
      const composerData = localStorage.getItem('composerPrompt')
      if (composerData) {
        params.value.prompt = composerData
        showToast('Loaded prompt from composer', 'success')
      } else {
        showToast('No composer data found', 'warning')
      }
    } catch (error) {
      console.error('Error loading composer data:', error)
    }
  }

  const useRandomPrompt = (): void => {
    const index = Math.floor(Math.random() * RANDOM_PROMPTS.length)
    params.value.prompt = RANDOM_PROMPTS[index]
    showToast('Random prompt generated', 'success')
  }

  watch(params, (newParams) => {
    saveParams(newParams)
  }, { deep: true })

  return {
    loadSavedParams,
    saveParams,
    savePreset,
    loadFromComposer,
    useRandomPrompt,
  }
}

export type UseGenerationPersistenceComposableReturn = ReturnType<typeof useGenerationPersistence>
