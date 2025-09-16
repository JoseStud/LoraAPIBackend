# FE-105: Wrap Generation History in a Vue island

## Summary
Introduce a thin Vue wrapper around Generation History to pave the way for full migration while reusing existing data/state modules.

## Affected Files
`app/frontend/static/js/components/generation-history/*`

## Tasks
- [ ] Create `GenerationHistory.vue` and mount in page template.
- [ ] Use existing modules for data until full migration is ready.
- [ ] Gradually port UI elements to Vue (follow-ups).

## Acceptance Criteria
- History renders via Vue mount with no regressions.

## References
`docs/VUE_MIGRATION.md`

