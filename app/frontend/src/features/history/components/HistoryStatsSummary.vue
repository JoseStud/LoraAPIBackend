<template>
  <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
    <div class="card">
      <div class="card-body text-center">
        <div class="text-2xl font-bold text-blue-600">{{ stats.total_results }}</div>
        <div class="text-sm text-gray-600">Total Images</div>
      </div>
    </div>
    <div class="card">
      <div class="card-body text-center">
        <div class="text-2xl font-bold text-green-600">{{ formattedAverageRating }}</div>
        <div class="text-sm text-gray-600">Average Rating</div>
      </div>
    </div>
    <div class="card">
      <div class="card-body text-center">
        <div class="text-2xl font-bold text-purple-600">{{ stats.total_favorites }}</div>
        <div class="text-sm text-gray-600">Favorited</div>
      </div>
    </div>
    <div class="card">
      <div class="card-body text-center">
        <div class="text-2xl font-bold text-orange-600">{{ formattedStorageUsed }}</div>
        <div class="text-sm text-gray-600">Storage Used</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { GenerationHistoryStats } from '@/types';
import { formatFileSize } from '@/utils/format';

const props = defineProps<{ stats: GenerationHistoryStats }>();

const formattedAverageRating = computed(() => props.stats.avg_rating.toFixed(1));
const formattedStorageUsed = computed(() =>
  formatFileSize(Number.isFinite(props.stats.total_size) ? props.stats.total_size : 0),
);
</script>
