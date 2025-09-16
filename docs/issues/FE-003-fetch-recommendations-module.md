# FE-003: Refactor recommendations module fetches to utils/api.js

## Summary
Adopt `utils/api.js` in the legacy recommendations Alpine module to improve consistency with Vue islands and reduce boilerplate.

## Affected Files
`app/frontend/static/js/components/recommendations/index.js`

## Tasks
- [ ] Replace LoRA list fetch with `fetchData((BACKEND_URL)/adapters)`.
- [ ] Replace any additional JSON requests with appropriate helper.
- [ ] Validate error paths and user feedback remain intact.

## Acceptance Criteria
- Recommendations data loads and updates without console errors.

## References
`docs/VUE_MIGRATION.md`
`app/frontend/static/js/utils/api.js`

