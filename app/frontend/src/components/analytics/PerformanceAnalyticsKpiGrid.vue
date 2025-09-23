<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
    <div class="card">
      <div class="card-body text-center">
        <div class="flex justify-center mb-2">
          <svg class="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div class="text-2xl font-bold text-blue-600">{{ kpis.total_generations }}</div>
        <div class="text-sm text-gray-600">Total Generations</div>
        <div class="text-xs mt-1" :class="kpis.generation_growth >= 0 ? 'text-green-600' : 'text-red-600'">
          {{ kpis.generation_growth >= 0 ? '+' : '' }}{{ kpis.generation_growth }}% vs last period
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-body text-center">
        <div class="flex justify-center mb-2">
          <svg class="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="text-2xl font-bold text-green-600">{{ formatDuration(kpis.avg_generation_time) }}</div>
        <div class="text-sm text-gray-600">Average Generation Time</div>
        <div class="text-xs mt-1" :class="kpis.time_improvement >= 0 ? 'text-green-600' : 'text-red-600'">
          {{ kpis.time_improvement >= 0 ? '-' : '+' }}{{ Math.abs(kpis.time_improvement) }}% vs last period
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-body text-center">
        <div class="flex justify-center mb-2">
          <svg class="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="text-2xl font-bold text-purple-600">{{ kpis.success_rate }}%</div>
        <div class="text-sm text-gray-600">Success Rate</div>
        <div class="text-xs mt-1">
          <span class="text-gray-500">{{ kpis.total_failed }}</span> failures
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-body text-center">
        <div class="flex justify-center mb-2">
          <svg class="w-8 h-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <div class="text-2xl font-bold text-orange-600">{{ kpis.active_loras }}</div>
        <div class="text-sm text-gray-600">Active LoRAs</div>
        <div class="text-xs mt-1">
          <span class="text-gray-500">{{ kpis.total_loras }}</span> total
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PerformanceKpiSummary } from '@/types';

defineProps<{
  kpis: PerformanceKpiSummary;
  formatDuration: (value: number) => string;
}>();
</script>
