import { computed, readonly, ref } from 'vue';

import { GenerationResultSchema } from '@/schemas';
import type { GenerationCompleteMessage, GenerationResult } from '@/types';

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

  const createResultFromCompletion = (message: GenerationCompleteMessage): GenerationResult => {
    const createdAt = message.created_at ?? new Date().toISOString();
    const imageUrl = message.image_url ?? (Array.isArray(message.images) ? message.images[0] ?? null : null);

    return parseResult({
      id: message.result_id ?? message.job_id,
      job_id: message.job_id,
      result_id: message.result_id,
      prompt: message.prompt,
      negative_prompt: message.negative_prompt,
      image_url: imageUrl,
      width: message.width,
      height: message.height,
      steps: message.steps,
      cfg_scale: message.cfg_scale,
      seed: message.seed ?? null,
      created_at: createdAt,
    });
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
    createResultFromCompletion,
  };
};

export type ResultsModule = ReturnType<typeof createResultsModule>;
