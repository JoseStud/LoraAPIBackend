<template>
  <canvas ref="canvasRef" class="w-full h-full"></canvas>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import type { Chart as ChartJS, ChartData } from 'chart.js';

import { buildPalette, createDoughnutChartOptions } from '@/utils/charts';
import type { LoraUsageSlice } from '@/types';

type ChartInstance = ChartJS<'doughnut', number[], string> | null;

interface Props {
  data: LoraUsageSlice[];
}

const props = defineProps<Props>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const chartRef = ref<ChartInstance>(null);

const buildChartData = (): ChartData<'doughnut', number[], string> => {
  const labels = props.data.map((item) => item.name);
  const data = props.data.map((item) => item.usage_count);

  return {
    labels,
    datasets: [
      {
        data,
        backgroundColor: buildPalette(data.length),
      },
    ],
  };
};

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

  chartRef.value = new Chart(canvasRef.value, {
    type: 'doughnut',
    data: buildChartData(),
    options: createDoughnutChartOptions(),
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
