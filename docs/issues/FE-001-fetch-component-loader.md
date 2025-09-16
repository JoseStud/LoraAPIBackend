# FE-001: Refactor component-loader fetches to utils/api.js

## Summary
Replace direct `fetch` calls in `component-loader.js` with the shared helpers from `app/frontend/static/js/utils/api.js` to standardize error handling and headers.

## Affected Files
`app/frontend/static/js/component-loader.js`

## Scope
- Tags: `(BACKEND_URL)/adapters/tags`
- Dashboard stats: `(BACKEND_URL)/dashboard/stats`
- Active jobs: `(BACKEND_URL)/jobs/active`

## Tasks
- [ ] Audit all `fetch(` occurrences in the file.
- [ ] Replace GETs with `fetchData(url)`.
- [ ] Ensure no binary/FormData requests are converted (none expected here).
- [ ] Verify `BACKEND_URL` rewrite shim in `base.html` continues to work.
- [ ] Manually test the affected UI flows in dev.

## Acceptance Criteria
- The three data pulls work as before without console errors.
- No regressions in dashboards/components that depend on this loader.

## References
`docs/VUE_MIGRATION.md`
`app/frontend/static/js/utils/api.js`

