import type { ChartOptions } from 'chart.js';

import type {
  GenerationVolumePoint,
  PerformanceSeriesPoint,
  ResourceUsagePoint,
} from '@/types';

export const GENERATION_VOLUME_COLOR = 'rgb(59, 130, 246)';
export const PERFORMANCE_TIME_COLOR = 'rgb(16, 185, 129)';
export const PERFORMANCE_SUCCESS_COLOR = 'rgb(139, 92, 246)';
export const RESOURCE_CPU_COLOR = 'rgb(59, 130, 246)';
export const RESOURCE_MEMORY_COLOR = 'rgb(16, 185, 129)';
export const RESOURCE_GPU_COLOR = 'rgb(239, 68, 68)';

export const DEFAULT_PALETTE: string[] = [
  'rgb(59, 130, 246)',
  'rgb(16, 185, 129)',
  'rgb(139, 92, 246)',
  'rgb(245, 158, 11)',
  'rgb(239, 68, 68)',
  'rgb(156, 163, 175)',
  'rgb(34, 197, 94)',
  'rgb(168, 85, 247)',
  'rgb(251, 146, 60)',
  'rgb(14, 165, 233)',
];

export const DEFAULT_TIME_LABEL_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

export function withAlpha(rgbColor: string, alpha: number): string {
  const match = rgbColor.match(/\d+/g);
  if (!match || match.length < 3) {
    return rgbColor;
  }

  const [r, g, b] = match.map(Number);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function formatTimeLabel(
  timestamp: string | number | Date,
  locales?: Intl.LocalesArgument,
  options: Intl.DateTimeFormatOptions = DEFAULT_TIME_LABEL_OPTIONS,
): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString(locales, options);
}

export function mapTimeSeriesLabels<T extends { timestamp: string | number }>(
  points: T[],
): string[] {
  return points.map((point) => formatTimeLabel(point.timestamp));
}

export function mapGenerationVolume(points: GenerationVolumePoint[]): number[] {
  return points.map((point) => point.count);
}

export function mapPerformanceSeries(points: PerformanceSeriesPoint[]): {
  avgTime: number[];
  successRate: number[];
} {
  return points.reduce<{ avgTime: number[]; successRate: number[] }>((acc, point) => {
    acc.avgTime.push(point.avg_time);
    acc.successRate.push(point.success_rate);
    return acc;
  }, { avgTime: [], successRate: [] });
}

export function mapResourceUsage(points: ResourceUsagePoint[]): {
  cpu: number[];
  memory: number[];
  gpu: number[];
} {
  return points.reduce<{ cpu: number[]; memory: number[]; gpu: number[] }>((acc, point) => {
    acc.cpu.push(point.cpu_percent);
    acc.memory.push(point.memory_percent);
    acc.gpu.push(point.gpu_percent);
    return acc;
  }, { cpu: [], memory: [], gpu: [] });
}

export function createBaseTimeSeriesOptions(): ChartOptions<'line'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 0,
        },
        grid: {
          display: false,
        },
      },
      y: {
        beginAtZero: true,
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
  };
}

export function createDoughnutChartOptions(): ChartOptions<'doughnut'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
      },
    },
  };
}

export function buildPalette(count: number): string[] {
  if (count <= DEFAULT_PALETTE.length) {
    return DEFAULT_PALETTE.slice(0, Math.max(count, 0));
  }

  const palette: string[] = [];
  for (let index = 0; index < count; index += 1) {
    palette.push(DEFAULT_PALETTE[index % DEFAULT_PALETTE.length]);
  }

  return palette;
}
