<template>
  <canvas ref="canvasRef" class="w-full h-full"></canvas>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import type { Chart as ChartJS, ChartData } from 'chart.js';

import {
  GENERATION_VOLUME_COLOR,
  createBaseTimeSeriesOptions,
  mapGenerationVolume,
  mapTimeSeriesLabels,
  withAlpha,
} from '@/utils/charts';
import type { GenerationVolumePoint } from '@/types';

type ChartInstance = ChartJS<'line', number[], string> | null;

interface Props {
  data: GenerationVolumePoint[];
}

const props = defineProps<Props>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const chartRef = ref<ChartInstance>(null);

const buildChartData = (): ChartData<'line', number[], string> => ({
  labels: mapTimeSeriesLabels(props.data),
  datasets: [
    {
      label: 'Generations',
      data: mapGenerationVolume(props.data),
      borderColor: GENERATION_VOLUME_COLOR,
      backgroundColor: withAlpha(GENERATION_VOLUME_COLOR, 0.1),
      tension: 0.1,
      fill: true,
    },
  ],
});

const applyDataToChart = () => {
  if (!chartRef.value) {
    return;
  }

  const chartData = buildChartData();
  chartRef.value.data.labels = chartData.labels;
  chartRef.value.data.datasets = chartData.datasets;
  chartRef.value.update();
};

const createChart = () => {
  if (chartRef.value || !canvasRef.value) {
    return;
  }

  const options = createBaseTimeSeriesOptions();
  chartRef.value = new Chart(canvasRef.value, {
    type: 'line',
    data: buildChartData(),
    options,
  });
};

watch(
  () => props.data,
  () => {
    if (!chartRef.value) {
      createChart();
    } else {
      applyDataToChart();
    }
  },
  { deep: true },
);

onMounted(() => {
  createChart();
});

onUnmounted(() => {
  chartRef.value?.destroy();
  chartRef.value = null;
});
</script>
