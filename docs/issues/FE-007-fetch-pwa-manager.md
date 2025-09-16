# FE-007: Review pwa-manager fetch usage (service worker constraints)

## Summary
Evaluate replacing direct `fetch` calls in the PWA manager with `utils/api.js`, accounting for service worker and offline caching behavior.

## Affected Files
`app/frontend/static/js/pwa-manager.js`

## Considerations
- Service Workers may intercept `fetch` and require specific options.
- Avoid forcing JSON headers on non-JSON requests.

## Tasks
- [ ] Audit `fetch` usage (action queue replay, fallbacks).
- [ ] Replace safe JSON calls with `fetchData`/`postData`.
- [ ] Leave any special cases (e.g., Request objects, streaming) as-is.
- [ ] Test offline/online transitions.

## Acceptance Criteria
- No regressions in PWA install, offline queueing, and sync behavior.

## References
`docs/VUE_MIGRATION.md`
`app/frontend/static/js/utils/api.js`

