# FE-005: Refactor prompt-composer fetches to utils/api.js

## Summary
Replace direct API calls in Prompt Composer with `utils/api.js` helpers.

## Affected Files
`app/frontend/static/js/components/prompt-composer.js`

## Tasks
- [ ] Use `fetchData` for adapters list.
- [ ] Use `postData` for generation submit (preserve existing request body shape).
- [ ] Validate error handling and UI messaging.

## Acceptance Criteria
- Prompt Composer loads options and submits generations successfully.

## References
`docs/VUE_MIGRATION.md`
`app/frontend/static/js/utils/api.js`

