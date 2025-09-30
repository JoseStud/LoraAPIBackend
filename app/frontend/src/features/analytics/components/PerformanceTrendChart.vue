<template>
  <canvas ref="canvasRef" class="w-full h-full"></canvas>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import Chart from 'chart.js/auto';
import type { Chart as ChartJS, ChartData, ChartOptions } from 'chart.js';

import {
  PERFORMANCE_SUCCESS_COLOR,
  PERFORMANCE_TIME_COLOR,
  createBaseTimeSeriesOptions,
  mapPerformanceSeries,
  mapTimeSeriesLabels,
  withAlpha,
} from '@/utils/charts';
import type { PerformanceSeriesPoint } from '@/types';

type ChartInstance = ChartJS<'line', number[], string> | null;

interface Props {
  data: PerformanceSeriesPoint[];
}

const props = defineProps<Props>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const chartRef = ref<ChartInstance>(null);

const buildChartData = (): ChartData<'line', number[], string> => {
  const series = mapPerformanceSeries(props.data);

  return {
    labels: mapTimeSeriesLabels(props.data),
    datasets: [
      {
        label: 'Avg Time (s)',
        data: series.avgTime,
        borderColor: PERFORMANCE_TIME_COLOR,
        backgroundColor: withAlpha(PERFORMANCE_TIME_COLOR, 0.1),
        tension: 0.1,
        yAxisID: 'y',
      },
      {
        label: 'Success Rate (%)',
        data: series.successRate,
        borderColor: PERFORMANCE_SUCCESS_COLOR,
        backgroundColor: withAlpha(PERFORMANCE_SUCCESS_COLOR, 0.1),
        tension: 0.1,
        yAxisID: 'y1',
      },
    ],
  };
};

const buildChartOptions = (): ChartOptions<'line'> => {
  const options = createBaseTimeSeriesOptions();
  options.plugins = {
    ...options.plugins,
    legend: {
      display: true,
    },
  };
  options.scales = {
    x: options.scales?.x,
    y: {
      type: 'linear',
      display: true,
      position: 'left',
    },
    y1: {
      type: 'linear',
      display: true,
      position: 'right',
      grid: {
        drawOnChartArea: false,
      },
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
  if (chartRef.value) {
    return;
  }

  const canvas = canvasRef.value;
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    return;
  }

  chartRef.value = new Chart(canvas, {
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
