import type { PerformanceInsightEntry } from '@/types';

type InsightSeverity = PerformanceInsightEntry['severity'];

export const successRateClass = (rate: number): string => {
  if (rate >= 95) return 'bg-green-100 text-green-800';
  if (rate >= 90) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

const severityMap: Record<InsightSeverity, {
  card: string;
  icon: string;
  text: string;
  description: string;
}> = {
  high: {
    card: 'border-red-200 bg-red-50',
    icon: 'text-red-500',
    text: 'text-red-800',
    description: 'text-red-700',
  },
  medium: {
    card: 'border-yellow-200 bg-yellow-50',
    icon: 'text-yellow-500',
    text: 'text-yellow-800',
    description: 'text-yellow-700',
  },
  low: {
    card: 'border-blue-200 bg-blue-50',
    icon: 'text-blue-500',
    text: 'text-blue-800',
    description: 'text-blue-700',
  },
};

export const insightCardClass = (severity: InsightSeverity): string => severityMap[severity]?.card ?? severityMap.low.card;

export const insightIconClass = (severity: InsightSeverity): string => severityMap[severity]?.icon ?? severityMap.low.icon;

export const insightTextClass = (severity: InsightSeverity): string => severityMap[severity]?.text ?? severityMap.low.text;

export const insightDescriptionClass = (severity: InsightSeverity): string =>
  severityMap[severity]?.description ?? severityMap.low.description;
