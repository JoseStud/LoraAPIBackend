<template>
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-semibold">Generation Volume</h3>
        <p class="text-sm text-gray-600">Number of generations over time</p>
      </div>
      <div class="card-body">
        <div class="h-64">
          <GenerationVolumeChart :data="chartData.generationVolume" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-semibold">Generation Performance</h3>
        <p class="text-sm text-gray-600">Average generation time trends</p>
      </div>
      <div class="card-body">
        <div class="h-64">
          <PerformanceTrendChart :data="chartData.performance" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-semibold">LoRA Usage Distribution</h3>
        <p class="text-sm text-gray-600">Most frequently used LoRAs</p>
      </div>
      <div class="card-body">
        <div class="h-64">
          <LoraUsageChart :data="chartData.loraUsage" />
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h3 class="text-lg font-semibold">System Resources</h3>
        <p class="text-sm text-gray-600">CPU, Memory, and GPU utilization</p>
      </div>
      <div class="card-body">
        <div class="h-64">
          <ResourceUsageChart :data="chartData.resourceUsage" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import GenerationVolumeChart from '@/components/analytics/GenerationVolumeChart.vue';
import LoraUsageChart from '@/components/analytics/LoraUsageChart.vue';
import PerformanceTrendChart from '@/components/analytics/PerformanceTrendChart.vue';
import ResourceUsageChart from '@/components/analytics/ResourceUsageChart.vue';
import type { PerformanceAnalyticsCharts } from '@/types';

defineProps<{
  chartData: PerformanceAnalyticsCharts;
}>();
</script>
