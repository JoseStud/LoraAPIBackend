<template>
  <div class="card">
    <div class="card-header">
      <h3 class="card-title">Generated Prompt</h3>
    </div>
    <div class="card-body space-y-3">
      <div>
        <label class="form-label" for="prompt-composer-base">Base Prompt</label>
        <textarea
          id="prompt-composer-base"
          class="form-input h-20"
          data-testid="base-prompt"
          :value="basePrompt"
          @input="onUpdateBase"
          placeholder="Enter your base prompt"
        ></textarea>
        <p v-if="basePromptError" class="text-xs text-red-600" data-testid="base-error">{{ basePromptError }}</p>
      </div>
      <div>
        <label class="form-label" for="prompt-composer-negative">Negative Prompt</label>
        <textarea
          id="prompt-composer-negative"
          class="form-input h-16"
          data-testid="negative-prompt"
          :value="negativePrompt"
          @input="onUpdateNegative"
          placeholder="Enter negative prompt"
        ></textarea>
      </div>
      <div>
        <label class="form-label" for="prompt-composer-final">Complete Prompt</label>
        <textarea
          id="prompt-composer-final"
          class="form-input h-28 font-mono text-xs"
          data-testid="final-prompt"
          :value="finalPrompt"
          readonly
        ></textarea>
      </div>
      <div class="space-y-2">
        <button class="btn btn-secondary w-full" type="button" data-testid="copy-prompt" @click="emit('copy')">
          Copy Prompt
        </button>
        <button
          class="btn btn-secondary w-full"
          type="button"
          data-testid="save-composition"
          :disabled="!canSave"
          @click="emit('save')"
        >
          Save Composition
        </button>
        <button
          class="btn btn-primary w-full"
          type="button"
          data-testid="generate-image"
          :disabled="!canGenerate"
          @click="emit('generate')"
        >
          <span v-if="!isGenerating">Generate Image</span>
          <span v-else>Generating…</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toRefs } from 'vue';

const props = defineProps<{
  basePrompt: string;
  negativePrompt: string;
  finalPrompt: string;
  basePromptError: string;
  isGenerating: boolean;
  canSave: boolean;
  canGenerate: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:basePrompt', value: string): void;
  (e: 'update:negativePrompt', value: string): void;
  (e: 'copy'): void;
  (e: 'save'): void;
  (e: 'generate'): void;
}>();

const { basePrompt, negativePrompt, finalPrompt, basePromptError, isGenerating, canSave, canGenerate } = toRefs(props);

const onUpdateBase = (event: Event) => {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update:basePrompt', target?.value ?? '');
};

const onUpdateNegative = (event: Event) => {
  const target = event.target as HTMLTextAreaElement | null;
  emit('update:negativePrompt', target?.value ?? '');
};
</script>

