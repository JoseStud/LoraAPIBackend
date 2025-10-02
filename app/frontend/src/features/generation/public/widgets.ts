/**
 * Lightweight public surface exposing standalone generation widgets. These components lazily
 * acquire the generation orchestrator in read-only mode so that dashboards can render queue and
 * status information without pulling the full studio bundle.
 */
export { default as JobQueueWidget } from '../components/JobQueue.vue';
export { default as SystemAdminStatusCard } from '../components/system/SystemAdminStatusCard.vue';
export { default as SystemStatusCard } from '../components/system/SystemStatusCard.vue';
export { default as SystemStatusPanel } from '../components/system/SystemStatusPanel.vue';
