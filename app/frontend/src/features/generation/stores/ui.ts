/** @internal */
import { effectScope, onScopeDispose, readonly, ref, type Ref } from 'vue';

import type { GenerationResult } from '@/types';

export type ReadonlyRef<T> = Readonly<Ref<T>>;

export interface GenerationStudioUiVm {
  showHistory: ReadonlyRef<boolean>;
  showModal: ReadonlyRef<boolean>;
  selectedResult: ReadonlyRef<GenerationResult | null>;
  setShowHistory(value: boolean): void;
  toggleHistory(): void;
  setShowModal(value: boolean): void;
  selectResult(result: GenerationResult | null): void;
  reset(): void;
  dispose(): void;
}

export const createGenerationStudioUiVm = (): GenerationStudioUiVm => {
  const scope = effectScope();

  const vm = scope.run(() => {
    const showHistory = ref(false);
    const showModal = ref(false);
    const selectedResult = ref<GenerationResult | null>(null);

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

    const reset = (): void => {
      showHistory.value = false;
      showModal.value = false;
      selectedResult.value = null;
    };

    onScopeDispose(() => {
      reset();
    });

    return {
      showHistory: readonly(showHistory),
      showModal: readonly(showModal),
      selectedResult: readonly(selectedResult),
      setShowHistory,
      toggleHistory,
      setShowModal,
      selectResult,
      reset,
    } satisfies Omit<GenerationStudioUiVm, 'dispose'>;
  });

  if (!vm) {
    throw new Error('Failed to create generation studio UI view model.');
  }

  const dispose = (): void => {
    scope.stop();
  };

  return {
    ...vm,
    dispose,
  } satisfies GenerationStudioUiVm;
};

export type { GenerationStudioUiVm as GenerationStudioUiStore };
