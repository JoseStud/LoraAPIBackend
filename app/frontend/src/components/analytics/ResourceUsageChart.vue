<template>
  <canvas ref="canvasRef" class="w-full h-full"></canvas>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import type { Chart as ChartJS, ChartData } from 'chart.js';

import {
  RESOURCE_CPU_COLOR,
  RESOURCE_GPU_COLOR,
  RESOURCE_MEMORY_COLOR,
  createBaseTimeSeriesOptions,
  mapResourceUsage,
  mapTimeSeriesLabels,
  withAlpha,
} from '@/utils/charts';
import type { ResourceUsagePoint } from '@/types';

type ChartInstance = ChartJS<'line', number[], string> | null;

interface Props {
  data: ResourceUsagePoint[];
}

const props = defineProps<Props>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const chartRef = ref<ChartInstance>(null);

const buildChartData = (): ChartData<'line', number[], string> => {
  const usage = mapResourceUsage(props.data);

  return {
    labels: mapTimeSeriesLabels(props.data),
    datasets: [
      {
        label: 'CPU %',
        data: usage.cpu,
        borderColor: RESOURCE_CPU_COLOR,
        backgroundColor: withAlpha(RESOURCE_CPU_COLOR, 0.1),
        tension: 0.1,
      },
      {
        label: 'Memory %',
        data: usage.memory,
        borderColor: RESOURCE_MEMORY_COLOR,
        backgroundColor: withAlpha(RESOURCE_MEMORY_COLOR, 0.1),
        tension: 0.1,
      },
      {
        label: 'GPU %',
        data: usage.gpu,
        borderColor: RESOURCE_GPU_COLOR,
        backgroundColor: withAlpha(RESOURCE_GPU_COLOR, 0.1),
        tension: 0.1,
      },
    ],
  };
};

const buildChartOptions = () => {
  const options = createBaseTimeSeriesOptions();
  options.plugins = {
    ...options.plugins,
    legend: {
      display: true,
      position: 'top',
    },
  };
  options.scales = {
    x: options.scales?.x,
    y: {
      beginAtZero: true,
      max: 100,
    },
  };

  return options;
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
    type: 'line',
    data: buildChartData(),
    options: buildChartOptions(),
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
