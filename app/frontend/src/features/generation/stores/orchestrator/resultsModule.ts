/** @internal */
import { computed, readonly, ref } from 'vue';

import { GenerationResultSchema } from '@/schemas';
import type { GenerationResult } from '@/types';

export const MAX_RESULTS = 200;
export const DEFAULT_HISTORY_LIMIT = 10;

const HISTORY_LIMIT_DEFAULT = DEFAULT_HISTORY_LIMIT;

const toHistoryLimit = (limit: number): number => {
  const normalized = Math.floor(Number(limit));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : HISTORY_LIMIT_DEFAULT;
};

const parseResult = (result: GenerationResult): GenerationResult =>
  GenerationResultSchema.parse(result) as GenerationResult;

export const createResultsModule = () => {
  const results = ref<GenerationResult[]>([]);
  const historyLimit = ref(HISTORY_LIMIT_DEFAULT);
  const resultsState = readonly(results);
  const historyLimitState = readonly(historyLimit);

  const recentResults = computed(() => resultsState.value);

  const resolveResultsLimit = (): number => {
    const normalized = Math.max(1, Math.floor(historyLimit.value || HISTORY_LIMIT_DEFAULT));
    return Math.min(normalized, MAX_RESULTS);
  };

  const clampResults = (list: GenerationResult[]): GenerationResult[] => {
    const limit = resolveResultsLimit();
    return list.slice(0, limit);
  };

  const addResult = (result: GenerationResult): void => {
    const sanitized = parseResult(result);
    results.value = clampResults([sanitized, ...results.value]);
  };

  const setResults = (list: GenerationResult[]): void => {
    const sanitized = list.map(parseResult);
    results.value = clampResults(sanitized);
  };

  const removeResult = (resultId: string | number): void => {
    results.value = results.value.filter((result) => result.id !== resultId);
  };

  const setHistoryLimit = (limit: number): void => {
    historyLimit.value = toHistoryLimit(limit);
    results.value = clampResults(results.value);
  };

  const resetResults = (): void => {
    results.value = [];
    historyLimit.value = HISTORY_LIMIT_DEFAULT;
  };

  return {
    results: resultsState,
    historyLimit: historyLimitState,
    recentResults,
    addResult,
    setResults,
    removeResult,
    setHistoryLimit,
    resetResults,
  };
};

export type ResultsModule = ReturnType<typeof createResultsModule>;
