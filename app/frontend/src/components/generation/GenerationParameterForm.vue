<template>
  <div class="card">
    <div class="card-header">
      <h3 class="card-title">Generation Parameters</h3>
    </div>
    <div class="card-body space-y-6">
      <!-- Prompt Input -->
      <div>
        <label class="form-label">Prompt</label>
        <textarea
          v-model="params.prompt"
          placeholder="Enter your prompt..."
          class="form-input h-24 resize-none"
        ></textarea>
      </div>

      <!-- Negative Prompt -->
      <div>
        <label class="form-label">Negative Prompt</label>
        <textarea
          v-model="params.negative_prompt"
          placeholder="Enter negative prompt..."
          class="form-input h-16 resize-none"
        ></textarea>
      </div>

      <!-- Image Dimensions -->
      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="form-label">Width</label>
          <select v-model="params.width" class="form-input">
            <option value="512">512px</option>
            <option value="768">768px</option>
            <option value="1024">1024px</option>
          </select>
        </div>
        <div>
          <label class="form-label">Height</label>
          <select v-model="params.height" class="form-input">
            <option value="512">512px</option>
            <option value="768">768px</option>
            <option value="1024">1024px</option>
          </select>
        </div>
      </div>

      <!-- Advanced Parameters -->
      <div class="space-y-4">
        <div>
          <label class="form-label">
            Steps: <span class="font-semibold">{{ params.steps }}</span>
          </label>
          <input
            type="range"
            v-model.number="params.steps"
            min="10"
            max="100"
            step="5"
            class="weight-slider-input"
          >
          <div class="slider-labels">
            <span>10</span>
            <span>50</span>
            <span>100</span>
          </div>
        </div>

        <div>
          <label class="form-label">
            CFG Scale: <span class="font-semibold">{{ params.cfg_scale }}</span>
          </label>
          <input
            type="range"
            v-model.number="params.cfg_scale"
            min="1"
            max="20"
            step="0.5"
            class="weight-slider-input"
          >
          <div class="slider-labels">
            <span>1</span>
            <span>7</span>
            <span>20</span>
          </div>
        </div>

        <div>
          <label class="form-label">Seed</label>
          <div class="flex space-x-2">
            <input
              type="number"
              v-model.number="params.seed"
              placeholder="-1 for random"
              class="form-input flex-1"
            >
            <button
              @click="setRandomSeed"
              class="btn btn-secondary btn-sm"
              type="button"
            >
              Random
            </button>
          </div>
        </div>
      </div>

      <!-- Batch Settings -->
      <div class="border-t pt-4">
        <h4 class="font-medium text-gray-900 mb-3">Batch Settings</h4>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="form-label">Batch Count</label>
            <input
              type="number"
              v-model.number="params.batch_count"
              min="1"
              max="10"
              class="form-input"
            >
          </div>
          <div>
            <label class="form-label">Batch Size</label>
            <input
              type="number"
              v-model.number="params.batch_size"
              min="1"
              max="4"
              class="form-input"
            >
          </div>
        </div>
      </div>

      <!-- Generate Button -->
      <button
        @click="emit('start-generation')"
        class="btn btn-primary w-full"
        :disabled="!params.prompt.trim() || isGenerating"
        type="button"
      >
        <div v-if="!isGenerating" class="flex items-center justify-center">
          <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
          </svg>
          Generate Image
        </div>
        <div v-else class="flex items-center justify-center">
          <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="m 12 2 a 10,10 0 0,1 10,10 h -4 a 6,6 0 0,0 -6,-6 z"></path>
          </svg>
          Generating...
        </div>
      </button>

      <!-- Quick Actions -->
      <div class="border-t pt-4">
        <h4 class="font-medium text-gray-900 mb-3">Quick Actions</h4>
        <div class="space-y-2">
          <button
            @click="emit('load-from-composer')"
            class="btn btn-secondary btn-sm w-full"
            type="button"
          >
            Load from Composer
          </button>
          <button
            @click="emit('use-random-prompt')"
            class="btn btn-secondary btn-sm w-full"
            type="button"
          >
            Random Prompt
          </button>
          <button
            @click="emit('save-preset')"
            class="btn btn-secondary btn-sm w-full"
            type="button"
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import type { Ref } from 'vue'

import type { GenerationFormState } from '@/types'

const props = defineProps<{
  params: Ref<GenerationFormState>
  isGenerating: boolean
}>()

const emit = defineEmits<{
  (event: 'start-generation'): void
  (event: 'load-from-composer'): void
  (event: 'use-random-prompt'): void
  (event: 'save-preset'): void
}>()

const params = props.params
const isGenerating = toRef(props, 'isGenerating')

const setRandomSeed = (): void => {
  params.value.seed = -1
}
</script>
