<template>
  <div class="flex flex-col gap-6">
    <PageHeader
      title="LoRA Collection"
      subtitle="Browse, filter, and manage your LoRA adapters."
    >
      <template #actions>
        <RouterLink class="btn btn-secondary btn-sm" to="/recommendations">
          View Recommendations
        </RouterLink>
      </template>
    </PageHeader>
    <LoraGallery />
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import { LoraGallery } from '@/features/lora/public';
import PageHeader from '@/components/layout/PageHeader.vue';
</script>
