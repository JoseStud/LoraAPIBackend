/** @internal */
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

const extractParamsFromResult = (
  result: GenerationResult,
): Partial<GenerationFormState> => {
  const updates: Partial<GenerationFormState> = {
    negative_prompt:
      typeof result.negative_prompt === 'string'
        ? result.negative_prompt
        : DEFAULT_FORM_STATE.negative_prompt,
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

  return updates;
};

export const useGenerationFormStore = defineStore('generation-form', () => {
  const params = ref<GenerationFormState>(createInitialParams());
  const isGenerating = ref(false);

  const setGenerating = (value: boolean): void => {
    isGenerating.value = value;
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

  const resetParams = (): void => {
    params.value = createInitialParams();
  };

  const applyResultParameters = (result: GenerationResult): void => {
    updateParams(extractParamsFromResult(result));
  };

  const reset = (): void => {
    resetParams();
    isGenerating.value = false;
  };

  return {
    params,
    isGenerating,
    setGenerating,
    applyResultParameters,
    updateParams,
    setPrompt,
    setNegativePrompt,
    setDimensions,
    setSteps,
    setCfgScale,
    setSeed,
    resetParams,
    reset,
  };
});

export type GenerationFormStore = ReturnType<typeof useGenerationFormStore>;
