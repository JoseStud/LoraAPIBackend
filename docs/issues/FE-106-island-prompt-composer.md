# FE-106: Migrate Prompt Composer to a Vue island

## Summary
Port Prompt Composer UI and actions to Vue for improved state handling and testability.

## Affected Files
`app/frontend/static/js/components/prompt-composer.js`

## Tasks
- [x] Create `PromptComposer.vue` with form state and validation.
- [x] Replace direct fetches with `useApi`/`utils/api.js`.
- [x] Add unit tests for validation and submission.

## Acceptance Criteria
- Composer functions end-to-end via Vue island.
- Unit tests cover validation, composition management, and submission.

## References
`docs/VUE_MIGRATION.md`
