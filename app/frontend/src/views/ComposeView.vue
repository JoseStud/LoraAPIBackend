<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Prompt Composer"
      subtitle="Create prompt compositions and manage adapter weights."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/generate">
          Open Generation Studio
        </RouterLink>
      </template>
    </PageHeader>
    <PromptComposer />
    <GenerationHistory />
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import GenerationHistory from '@/components/GenerationHistory.vue';
import PageHeader from '@/components/PageHeader.vue';
import PromptComposer from '@/components/PromptComposer.vue';
</script>
