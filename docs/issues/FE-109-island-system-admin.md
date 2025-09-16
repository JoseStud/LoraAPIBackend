# FE-109: Gradually islandize System Admin screens

## Summary
Break down the System Admin area into Vue islands (status, workers, DB, config, logs) over time.

## Affected Files
`app/frontend/static/js/components/system-admin.js`

## Approach
- Start with read-only panels (status, stats, metrics) as islands.
- Progress to interactive sections (workers management, DB ops, logs).
- Keep binary upload/download direct fetches intact.

## Tasks
- [ ] Identify first island (e.g., StatusCard.vue).
- [ ] Create mounts in relevant templates.
- [ ] Share state via composables when useful.

## Acceptance Criteria
- At least one admin subsection delivered as a Vue island without regressions.

## References
`docs/VUE_MIGRATION.md`

