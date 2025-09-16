# FE-006: Refactor generation-studio fetches to utils/api.js

## Summary
Consolidate data access in the Generation Studio Alpine module using `utils/api.js`.

## Affected Files
`app/frontend/static/js/components/generation-studio.js`

## Tasks
- [ ] Replace system status, active jobs, and results loads with `fetchData`.
- [ ] Convert JSON POST/PUT endpoints to `postData`/`putData` where applicable.
- [ ] Keep websocket or streaming endpoints untouched (if any).

## Acceptance Criteria
- Studio loads and updates data without regressions.

## References
`docs/VUE_MIGRATION.md`
`app/frontend/static/js/utils/api.js`

