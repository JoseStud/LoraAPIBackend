<template>
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
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

import PageHeader from '@/components/layout/PageHeader.vue';
</script>
