import { onUnmounted, watch, type Ref } from 'vue'

import { PERSISTENCE_KEYS, useDialogService, usePersistence } from '@/composables/shared'
import { useGenerationFormStore } from '@/features/generation/stores'
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
  load: () => void
  save: (value?: GenerationFormState) => void
  savePreset: () => Promise<void>
  loadFromComposer: () => void
  useRandomPrompt: () => void
}

export const useGenerationPersistence = ({
  params,
  showToast,
}: UseGenerationPersistenceOptions): UseGenerationPersistenceReturn => {
  const formStore = useGenerationFormStore()
  const persistence = usePersistence()

  const load = (): void => {
    try {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search)
        const prompt = urlParams.get('prompt')
        if (typeof prompt === 'string') {
          formStore.setPrompt(prompt)
        }
      }

      const saved = persistence.getJSON<Partial<GenerationFormState> | null>(
        PERSISTENCE_KEYS.generationParams,
        null,
      )

      if (saved) {
        formStore.updateParams(saved)
      }
    } catch (error) {
      console.error('Error loading saved parameters:', error)
    }
  }

  const persistParams = (value: GenerationFormState = params.value): void => {
    persistence.setJSON(PERSISTENCE_KEYS.generationParams, value)
  }

  let saveDebounceTimeout: ReturnType<typeof setTimeout> | null = null

  const scheduleSave = (value: GenerationFormState = params.value): void => {
    if (saveDebounceTimeout) {
      clearTimeout(saveDebounceTimeout)
    }

    saveDebounceTimeout = setTimeout(() => {
      persistParams(value)
      saveDebounceTimeout = null
    }, 200)
  }

  const save = (value: GenerationFormState = params.value): void => {
    if (saveDebounceTimeout) {
      clearTimeout(saveDebounceTimeout)
      saveDebounceTimeout = null
    }

    persistParams(value)
  }

  const { prompt: requestPrompt } = useDialogService()

  const savePreset = async (): Promise<void> => {
    const presetName = await requestPrompt({
      title: 'Save preset',
      message: 'Enter a name for this preset:',
      confirmLabel: 'Save preset',
      cancelLabel: 'Cancel',
      placeholder: 'Preset name',
      inputLabel: 'Preset name',
      requireValue: true,
    })

    const trimmedName = presetName?.trim()
    if (!trimmedName) {
      return
    }

    const preset = {
      name: trimmedName,
      params: { ...params.value },
      created_at: new Date().toISOString(),
    }

    try {
      const savedPresets = persistence.getJSON<unknown[]>(
        PERSISTENCE_KEYS.generationPresets,
        [],
      )
      const nextPresets = [...savedPresets, preset]

      persistence.setJSON(PERSISTENCE_KEYS.generationPresets, nextPresets)
      showToast(`Preset "${trimmedName}" saved`, 'success')
    } catch (error) {
      console.error('Failed to save preset:', error)
      showToast('Failed to save preset', 'error')
    }
  }

  const loadFromComposer = (): void => {
    try {
      const composerData =
        persistence.getJSON<string | null>(
          PERSISTENCE_KEYS.composerPrompt,
          null,
      ) ?? persistence.getItem(PERSISTENCE_KEYS.composerPrompt)

      if (composerData) {
        formStore.setPrompt(composerData)
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
    formStore.setPrompt(RANDOM_PROMPTS[index])
    showToast('Random prompt generated', 'success')
  }

  const stopWatching = watch(
    params,
    (newParams) => {
      scheduleSave(newParams)
    },
    { deep: true },
  )

  onUnmounted(() => {
    if (saveDebounceTimeout) {
      clearTimeout(saveDebounceTimeout)
      saveDebounceTimeout = null
    }

    stopWatching()
  })

  return {
    load,
    save,
    savePreset,
    loadFromComposer,
    useRandomPrompt,
  }
}

export type UseGenerationPersistenceComposableReturn = ReturnType<typeof useGenerationPersistence>
