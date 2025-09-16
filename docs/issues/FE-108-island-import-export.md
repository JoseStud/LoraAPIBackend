# FE-108: Migrate Import/Export to a Vue island

## Summary
Port Import/Export UI to Vue to consolidate data flow and error handling.

## Affected Files
`app/frontend/static/js/components/import-export/*`

## Tasks
- [ ] Create `ImportExport.vue` for controls and status.
- [ ] Keep file upload/download logic using direct fetch/XHR where necessary.
- [ ] Use `useApi`/`utils/api.js` for JSON calls.

## Acceptance Criteria
- Import/Export works end-to-end with proper feedback.

## References
`docs/VUE_MIGRATION.md`

