/**
 * Public surface for the generation feature. Consumers outside the feature should import from
 * this module instead of reaching into nested folders.
 */
export { default as GenerationShell } from './ui/GenerationShell.vue';
export { useGenerationStudioController } from './composables/useGenerationStudioController';
export { default as JobQueueWidget } from './public/jobQueueWidget';
/** @internal @deprecated Use {@link JobQueueWidget} instead. */
export { default as JobQueue } from './components/JobQueue.vue';
export { default as SystemAdminStatusCard } from './components/system/SystemAdminStatusCard.vue';
export { default as SystemStatusCard } from './components/system/SystemStatusCard.vue';
export { default as SystemStatusPanel } from './components/system/SystemStatusPanel.vue';

export type {
  GenerationJobView,
  GenerationResultView,
  QueueItemView,
  ReadonlyQueue,
  ReadonlyResults,
  ResultItemView,
} from './orchestrator/facade';

/** @internal */
export { useGenerationOrchestratorFacade } from './orchestrator/facade';
/** @internal */
export { useGenerationOrchestratorManager } from './composables/useGenerationOrchestratorManager';
/** @internal */
export type {
  GenerationOrchestratorAutoSyncOptions,
  GenerationOrchestratorBinding,
} from './composables/useGenerationOrchestratorManager';
