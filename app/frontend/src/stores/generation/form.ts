import { ref } from 'vue';
import { defineStore } from 'pinia';

import type { GenerationFormState, GenerationResult } from '@/types';

const DEFAULT_FORM_STATE: GenerationFormState = {
  prompt: '',
  negative_prompt: '',
  steps: 20,
  sampler_name: 'DPM++ 2M',
  cfg_scale: 7.0,
  width: 512,
  height: 512,
  seed: -1,
  batch_size: 1,
  batch_count: 1,
  denoising_strength: null,
};

const createInitialParams = (): GenerationFormState => ({
  ...DEFAULT_FORM_STATE,
});

export const useGenerationFormStore = defineStore('generation-form', () => {
  const params = ref<GenerationFormState>(createInitialParams());
  const isGenerating = ref(false);
  const showHistory = ref(false);
  const showModal = ref(false);
  const selectedResult = ref<GenerationResult | null>(null);

  const setGenerating = (value: boolean): void => {
    isGenerating.value = value;
  };

  const setShowHistory = (value: boolean): void => {
    showHistory.value = value;
  };

  const toggleHistory = (): void => {
    showHistory.value = !showHistory.value;
  };

  const setShowModal = (value: boolean): void => {
    showModal.value = value;
    if (!value) {
      selectedResult.value = null;
    }
  };

  const selectResult = (result: GenerationResult | null): void => {
    selectedResult.value = result;
    showModal.value = result != null;
  };

  const updateParams = (updates: Partial<GenerationFormState>): void => {
    params.value = { ...params.value, ...updates };
  };

  const setPrompt = (prompt: string): void => {
    updateParams({ prompt });
  };

  const setNegativePrompt = (negativePrompt: string): void => {
    updateParams({ negative_prompt: negativePrompt });
  };

  const setDimensions = ({
    width,
    height,
  }: Partial<Pick<GenerationFormState, 'width' | 'height'>>): void => {
    const updates: Partial<GenerationFormState> = {};

    if (typeof width === 'number') {
      updates.width = width;
    }

    if (typeof height === 'number') {
      updates.height = height;
    }

    if (Object.keys(updates).length > 0) {
      updateParams(updates);
    }
  };

  const setSteps = (steps: number): void => {
    updateParams({ steps });
  };

  const setCfgScale = (cfgScale: number): void => {
    updateParams({ cfg_scale: cfgScale });
  };

  const setSeed = (seed: number): void => {
    updateParams({ seed });
  };

  const applyResultParameters = (result: GenerationResult): void => {
    const updates: Partial<GenerationFormState> = {
      negative_prompt:
        typeof result.negative_prompt === 'string' ? result.negative_prompt : '',
    };

    if (typeof result.prompt === 'string') {
      updates.prompt = result.prompt;
    }

    if (typeof result.width === 'number') {
      updates.width = result.width;
    }

    if (typeof result.height === 'number') {
      updates.height = result.height;
    }

    if (typeof result.steps === 'number') {
      updates.steps = result.steps;
    }

    if (typeof result.cfg_scale === 'number') {
      updates.cfg_scale = result.cfg_scale;
    }

    if (typeof result.seed === 'number') {
      updates.seed = result.seed;
    }

    updateParams(updates);
  };

  const resetParams = (): void => {
    params.value = createInitialParams();
  };

  const reset = (): void => {
    resetParams();
    isGenerating.value = false;
    showHistory.value = false;
    showModal.value = false;
    selectedResult.value = null;
  };

  return {
    params,
    isGenerating,
    showHistory,
    showModal,
    selectedResult,
    setGenerating,
    setShowHistory,
    toggleHistory,
    setShowModal,
    selectResult,
    updateParams,
    setPrompt,
    setNegativePrompt,
    setDimensions,
    setSteps,
    setCfgScale,
    setSeed,
    applyResultParameters,
    resetParams,
    reset,
  };
});

export type GenerationFormStore = ReturnType<typeof useGenerationFormStore>;
