import type { ComputedRef, Ref } from 'vue';

import type { AdapterSummary, CompositionEntry } from '@/types';

import { useAdapterCatalog, type AdapterCatalogApi } from './useAdapterCatalog';
import { usePromptCompositionPersistence } from '../prompt-composer/usePromptCompositionPersistence';
import { usePromptCompositionState } from '../prompt-composer/usePromptCompositionState';
import { usePromptGenerationActions } from '../prompt-composer/usePromptGenerationActions';

export interface PromptCompositionState {
  catalog: AdapterCatalogApi;
  activeLoras: Ref<CompositionEntry[]>;
  basePrompt: Ref<string>;
  negativePrompt: Ref<string>;
  finalPrompt: ComputedRef<string>;
  basePromptError: Ref<string>;
  isGenerating: Ref<boolean>;
  canGenerate: ComputedRef<boolean>;
  canSave: ComputedRef<boolean>;
}

export interface PromptCompositionActions {
  addToComposition: (lora: AdapterSummary) => void;
  removeFromComposition: (index: number) => void;
  moveUp: (index: number) => void;
  moveDown: (index: number) => void;
  updateWeight: (index: number, weight: number) => void;
  balanceWeights: () => void;
  duplicateComposition: () => void;
  clearComposition: () => void;
  setBasePrompt: (value: string) => void;
  setNegativePrompt: (value: string) => void;
  copyPrompt: () => Promise<boolean>;
  saveComposition: () => void;
  loadComposition: () => void;
  generateImage: () => Promise<boolean>;
  isInComposition: (id: AdapterSummary['id']) => boolean;
}

export const usePromptComposition = (): PromptCompositionState & PromptCompositionActions => {
  const catalog = useAdapterCatalog();
  const state = usePromptCompositionState();
  const persistence = usePromptCompositionPersistence({
    activeLoras: state.activeLoras,
    basePrompt: state.basePrompt,
    negativePrompt: state.negativePrompt,
    basePromptError: state.basePromptError,
  });
  const generation = usePromptGenerationActions({
    finalPrompt: state.finalPrompt,
    negativePrompt: state.negativePrompt,
    activeLoras: state.activeLoras,
    validate: state.validate,
  });

  return {
    catalog,
    activeLoras: state.activeLoras,
    basePrompt: state.basePrompt,
    negativePrompt: state.negativePrompt,
    finalPrompt: state.finalPrompt,
    basePromptError: state.basePromptError,
    isGenerating: generation.isGenerating,
    canGenerate: generation.canGenerate,
    canSave: state.canSave,
    addToComposition: state.addToComposition,
    removeFromComposition: state.removeFromComposition,
    moveUp: state.moveUp,
    moveDown: state.moveDown,
    updateWeight: state.updateWeight,
    balanceWeights: state.balanceWeights,
    duplicateComposition: state.duplicateComposition,
    clearComposition: state.clearComposition,
    setBasePrompt: state.setBasePrompt,
    setNegativePrompt: state.setNegativePrompt,
    copyPrompt: generation.copyPrompt,
    saveComposition: persistence.saveComposition,
    loadComposition: persistence.loadComposition,
    generateImage: generation.generateImage,
    isInComposition: state.isInComposition,
  };
};
