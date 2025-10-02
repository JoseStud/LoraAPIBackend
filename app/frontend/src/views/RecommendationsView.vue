<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="Recommendations"
      subtitle="Discover compatible LoRAs based on similarity metrics."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/loras">
          Browse LoRAs
        </RouterLink>
      </template>
    </PageHeader>
    <div class="grid gap-6 xl:grid-cols-[2fr_1fr]">
      <RecommendationsPanel />
      <div class="flex flex-col gap-6">
        <SystemStatusCard variant="detailed" />
        <GenerationHistory />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue';
import { RouterLink } from 'vue-router';

import { GenerationHistory } from '@/features/history/public';
import PageHeader from '@/components/layout/PageHeader.vue';
import { RecommendationsPanel } from '@/features/recommendations/public';

const loadGenerationWidgets = () => import('@/features/generation/public/widgets');

const SystemStatusCard = defineAsyncComponent({
  loader: () => loadGenerationWidgets().then((module) => module.SystemStatusCard),
  suspensible: false,
});
</script>
