# FE-002: Refactor alpine-config fetches to utils/api.js

## Summary
Standardize data access in `alpine-config.js` by replacing direct `fetch` calls with `fetchData`, `putData`, `deleteData` from `utils/api.js`.

## Affected Files
`app/frontend/static/js/alpine-config.js`

## Scope (examples from rg):
- GET results lists, dashboard stats, background jobs.
- PUT ratings, favorites.
- DELETE results and bulk deletes.
- POST exports (keep as direct fetch for blob download).

## Tasks
- [ ] Replace JSON GET/PUT/DELETE with util helpers.
- [ ] Keep blob downloads (exports, image download) using direct `fetch`.
- [ ] Ensure request bodies remain JSON encoded where needed.
- [ ] Smoke-test flows in dev.

## Acceptance Criteria
- All list, update, and delete flows operate without errors.
- Export/download continues to work (binary paths untouched).

## References
`docs/VUE_MIGRATION.md`
`app/frontend/static/js/utils/api.js`

