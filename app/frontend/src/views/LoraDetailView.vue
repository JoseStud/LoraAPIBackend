<template>
  <LoraDetail :lora-id="loraId" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

import { LoraDetail } from '@/features/lora/public';

const route = useRoute();
const loraId = computed(() => String(route.params.id ?? ''));
</script>
