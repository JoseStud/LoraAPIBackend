<template>
  <ImportExport />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

import ImportExport from './ImportExport.vue';

import { provideImportExportContext } from '@/composables/import-export';

const emit = defineEmits<{ (event: 'initialized'): void }>();

const { initialize } = provideImportExportContext();

onMounted(async () => {
  await initialize();
  emit('initialized');
});
</script>
