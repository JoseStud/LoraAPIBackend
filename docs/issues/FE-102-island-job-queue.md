# FE-102: Migrate Job Queue UI to a Vue island

## Summary
Extract the Job Queue widget into a Vue component to improve reusability between pages.

## Affected Files
`app/frontend/static/js/components/job-queue/*`

## Tasks
- [ ] Create `JobQueue.vue` with props for control.
- [ ] Port polling and cancellation actions.
- [ ] Mount where used via `data-vue-root`.
- [ ] Add unit tests for status rendering and actions.

## Acceptance Criteria
- Job list, progress, and cancellation work as before.

## References
`docs/VUE_MIGRATION.md`

