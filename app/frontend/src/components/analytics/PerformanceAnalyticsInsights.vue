<template>
  <div class="card mb-8">
    <div class="card-header">
      <h3 class="text-lg font-semibold">Performance Insights</h3>
      <p class="text-sm text-gray-600">AI-powered recommendations for system optimization</p>
    </div>
    <div class="card-body">
      <div v-if="insights.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div
          v-for="insight in insights"
          :key="insight.id"
          class="border rounded-lg p-4"
          :class="cardClass(insight.severity)"
        >
          <div class="flex items-start">
            <div class="flex-shrink-0">
              <svg class="w-5 h-5" :class="iconClass(insight.severity)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div class="ml-3">
              <h4 class="text-sm font-medium" :class="textClass(insight.severity)">{{ insight.title }}</h4>
              <p class="mt-1 text-sm" :class="descriptionClass(insight.severity)">{{ insight.description }}</p>
              <div class="mt-2">
                <button
                  type="button"
                  class="text-xs font-medium hover:underline"
                  :class="textClass(insight.severity)"
                  @click="emitApply(insight)"
                >
                  Apply Recommendation →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-8 text-gray-500">
        <svg class="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p>System is performing optimally!</p>
        <p class="text-sm">No performance recommendations at this time.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { insightCardClass, insightDescriptionClass, insightIconClass, insightTextClass } from '@/utils/analyticsFormatting';
import type { PerformanceInsightEntry } from '@/types';

type InsightSeverity = PerformanceInsightEntry['severity'];

defineProps<{
  insights: PerformanceInsightEntry[];
}>();

const emit = defineEmits<{
  (e: 'apply', insight: PerformanceInsightEntry): void;
}>();

const cardClass = (severity: InsightSeverity) => insightCardClass(severity);
const iconClass = (severity: InsightSeverity) => insightIconClass(severity);
const textClass = (severity: InsightSeverity) => insightTextClass(severity);
const descriptionClass = (severity: InsightSeverity) => insightDescriptionClass(severity);

const emitApply = (insight: PerformanceInsightEntry) => {
  emit('apply', insight);
};
</script>
