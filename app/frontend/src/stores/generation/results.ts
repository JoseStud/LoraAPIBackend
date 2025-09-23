import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import type { GenerationResult } from '@/types';

export const MAX_RESULTS = 20;
export const DEFAULT_HISTORY_LIMIT = 10;

const sanitizeResult = (result: GenerationResult): GenerationResult => {
  if (typeof result.created_at === 'string' && result.created_at.trim()) {
    return result;
  }
  return { ...result, created_at: new Date().toISOString() };
};

export const useGenerationResultsStore = defineStore('generation-results', () => {
  const results = ref<GenerationResult[]>([]);
  const historyLimit = ref(DEFAULT_HISTORY_LIMIT);

  const recentResults = computed(() => results.value);

  function addResult(result: GenerationResult): void {
    const sanitized = sanitizeResult(result);
    results.value = [sanitized, ...results.value].slice(0, MAX_RESULTS);
  }

  function setResults(list: GenerationResult[]): void {
    results.value = list.slice(0, MAX_RESULTS).map(sanitizeResult);
  }

  function removeResult(resultId: string | number): void {
    results.value = results.value.filter((result) => result.id !== resultId);
  }

  function setHistoryLimit(limit: number): void {
    const normalized = Math.max(1, Math.floor(Number(limit) || 0));
    historyLimit.value = Number.isFinite(normalized) && normalized > 0
      ? normalized
      : DEFAULT_HISTORY_LIMIT;
  }

  function reset(): void {
    results.value = [];
    historyLimit.value = DEFAULT_HISTORY_LIMIT;
  }

  return {
    results,
    historyLimit,
    recentResults,
    addResult,
    setResults,
    removeResult,
    setHistoryLimit,
    reset,
  };
});
