<template>
  <div class="space-y-6">
    <div class="page-header">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="page-title">Prompt Composer</h1>
          <p class="page-subtitle">Build and compose prompts with LoRAs</p>
        </div>
        <div class="header-actions flex gap-2">
          <button class="btn btn-secondary btn-sm" type="button" @click="loadComposition">Load Composition</button>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="!canSave" @click="clearComposition">
            Clear All
          </button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div class="lg:col-span-1">
        <PromptComposerAvailableList
          :loras="filteredLoras"
          :search-term="searchTerm"
          :active-only="activeOnly"
          :is-loading="isLoading"
          :error="error"
          :is-in-composition="isInComposition"
          @update:searchTerm="setSearchTerm"
          @update:activeOnly="setActiveOnly"
          @select="addToComposition"
        />
      </div>

      <div class="lg:col-span-1">
        <PromptComposerComposition
          :items="activeLoras"
          @remove="removeFromComposition"
          @move-up="moveUp"
          @move-down="moveDown"
          @update-weight="onUpdateWeight"
          @balance="balanceWeights"
          @duplicate="duplicateComposition"
        />
      </div>

      <div class="lg:col-span-1">
        <PromptComposerActions
          :base-prompt="basePrompt"
          :negative-prompt="negativePrompt"
          :final-prompt="finalPrompt"
          :base-prompt-error="basePromptError"
          :is-generating="isGenerating"
          :can-save="canSave"
          :can-generate="canGenerate"
          @update:basePrompt="setBasePrompt"
          @update:negativePrompt="setNegativePrompt"
          @copy="copyPrompt"
          @save="saveComposition"
          @generate="generateImage"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PromptComposerActions from './PromptComposerActions.vue';
import PromptComposerAvailableList from './PromptComposerAvailableList.vue';
import PromptComposerComposition from './PromptComposerComposition.vue';

import { usePromptComposition } from '@/composables/compose';

const {
  catalog,
  activeLoras,
  basePrompt,
  negativePrompt,
  finalPrompt,
  basePromptError,
  isGenerating,
  canGenerate,
  canSave,
  addToComposition,
  removeFromComposition,
  moveUp,
  moveDown,
  updateWeight,
  balanceWeights,
  duplicateComposition,
  clearComposition,
  setBasePrompt,
  setNegativePrompt,
  copyPrompt,
  saveComposition,
  loadComposition,
  generateImage,
  isInComposition,
} = usePromptComposition();

const {
  filteredAdapters: filteredLoras,
  searchTerm,
  activeOnly,
  isLoading,
  error,
  setSearchTerm,
  setActiveOnly,
} = catalog;

const onUpdateWeight = (payload: { index: number; weight: number }) => {
  updateWeight(payload.index, payload.weight);
};
</script>

