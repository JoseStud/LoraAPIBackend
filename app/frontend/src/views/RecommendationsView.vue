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
import { RouterLink } from 'vue-router';

import GenerationHistory from '@/components/GenerationHistory.vue';
import PageHeader from '@/components/PageHeader.vue';
import RecommendationsPanel from '@/components/RecommendationsPanel.vue';
import SystemStatusCard from '@/components/SystemStatusCard.vue';
</script>
