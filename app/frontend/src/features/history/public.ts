/**
 * Public surface for the history feature. Consumers outside the feature should import from
 * this module instead of reaching into nested folders.
 */
export { default as GenerationHistory } from './components/GenerationHistory.vue';
/** @internal */
export { default as HistoryRecentResultCard } from './components/HistoryRecentResultCard.vue';

export { listResults } from './services/historyService';
export type { ListResultsOptions, ListResultsOutput } from './services/historyService';
