# FE-004: Refactor dashboard module fetches to utils/api.js

## Summary
Use `utils/api.js` helpers in the dashboard Alpine module to unify network handling.

## Affected Files
`app/frontend/static/js/components/dashboard/index.js`

## Tasks
- [ ] Replace dashboard stats GET with `fetchData('/api/dashboard/stats' or BACKEND_URL variant)`.
- [ ] Confirm shim in `base.html` properly rewrites `/api/*` in dev/prod.
- [ ] Verify UI updates work as before.

## Acceptance Criteria
- Dashboard loads stats successfully with no regressions.

## References
`docs/VUE_MIGRATION.md`
`app/frontend/static/js/utils/api.js`

