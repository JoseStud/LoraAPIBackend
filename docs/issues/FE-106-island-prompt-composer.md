# FE-106: Migrate Prompt Composer to a Vue island

## Summary
Port Prompt Composer UI and actions to Vue for improved state handling and testability.

## Affected Files
`app/frontend/static/js/components/prompt-composer.js`

## Tasks
- [ ] Create `PromptComposer.vue` with form state and validation.
- [ ] Replace direct fetches with `useApi`/`utils/api.js`.
- [ ] Add unit tests for validation and submission.

## Acceptance Criteria
- Composer functions end-to-end via Vue island.

## References
`docs/VUE_MIGRATION.md`

