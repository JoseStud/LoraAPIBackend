# FE-008: Refactor common.js adapter actions to utils/api.js

## Summary
Use `utils/api.js` helpers for adapter actions in `common.js` to reduce duplication and centralize error handling.

## Affected Files
`app/frontend/static/js/common.js`

## Tasks
- [ ] Replace adapter action calls with `postData` or `fetchData` as appropriate.
- [ ] Preserve any custom headers required by endpoints.
- [ ] Smoke test flows that trigger adapter actions.

## Acceptance Criteria
- Adapter actions still work and surface errors clearly.

## References
`docs/VUE_MIGRATION.md`
`app/frontend/static/js/utils/api.js`

