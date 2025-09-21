# Vue 3 Migration Status

The LoRA Manager frontend now ships as a single Vue 3 application. FastAPI serves the built Vite bundle and every workflow is rendered via Vue Router views. The hybrid "Vue islands inside Alpine templates" architecture has been retired.

## Current State

- Vue bootstrap lives in `app/frontend/src/main.ts` and mounts the SPA at `#app`.
- Routing and layout are handled by `App.vue` + `router/index.ts` with shared navigation components.
- Pinia stores provide shared state for queue metrics, prompt compositions, recommendations, and system status.
- Tailwind scans `.vue` files exclusively; the `app/frontend/static/js` directory has been removed.
- Workflow views exercise the full feature set:
  - **Dashboard** combines status cards, queue controls, prompt tools, gallery, history, and import/export.
  - **Generate** pairs the studio with queue telemetry, system status, and recommendations.
  - **Compose** focuses on the prompt composer with history review.
  - **History** mixes the archival grid with queue/system context.
  - **LoRAs & Recommendations** surface the gallery and similarity explorer respectively.

## Retired Legacy Assets

- `app/frontend/static/js/components/**/*`
- `app/frontend/static/js/component-loader.js`
- `app/frontend/static/js/alpine-config*.js`
- `app/frontend/static/js/common.js`, `htmx-config.js`, `pwa-manager.js`, `theme-toggle.js`
- Jest suites that required the Alpine globals and loader stubs

## Tests & Validation

- Python regression tests in `tests/unit/test_frontend_structure.py` ensure the SPA shell exists, templates stay removed, and each view keeps its feature coverage.
- Vitest runs against the Vue SFCs (`npm run test:unit:vue`).
- Jest remains available for DOM utility smoke tests but no longer depends on Alpine globals.

## Next Steps

1. Continue migrating remaining DOM helpers in `src/utils/legacy.ts` into typed Vue composables as they become redundant.
2. Port Vitest specs to TypeScript for end-to-end type safety.
3. Expand smoke coverage for queue polling and websocket reconnection paths in the Vue studio components.
