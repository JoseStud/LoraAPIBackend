<template>
  <div class="flex flex-col gap-6">
    <PromptComposerHeader />
    <PromptComposer />
    <PromptComposerHistoryPanel />
  </div>
</template>

<script setup lang="ts">
import PromptComposer from './PromptComposer.vue';
import PromptComposerHeader from './PromptComposerHeader.vue';
import PromptComposerHistoryPanel from './PromptComposerHistoryPanel.vue';
</script>
