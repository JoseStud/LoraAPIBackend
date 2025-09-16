# Vue 3 Islands Migration

This document tracks the progressive migration from HTMX + Alpine.js to Vue 3 using an "islands" architecture. Vue and Alpine coexist; Vue controls isolated mount points while the rest of the page continues to function unchanged.

## Current State

- Vite plugin for Vue added (`@vitejs/plugin-vue`).
- Vue 3 dependency declared and available in app runtime.
- Islands scaffolding in place: `HelloWorld.vue` and `RecommendationsPanel.vue`.
- Second island migrated: `MobileNav.vue` (replaces Alpine mobile nav in `base.html`).
- System status widget migrated: `SystemStatusCard.vue` (used on generation pages via Vue island).
- Conditional, scoped island mounting wired into the single entrypoint (`app/frontend/static/js/main.js`).
- Tailwind configured to scan `.vue` files (`tailwind.config.js`).
- Example mounts present in `app/frontend/templates/pages/recommendations.html`.
- Vitest configured for Vue SFCs with `@vue/test-utils`; example specs added for both islands.
- Dev proxy set in `vite.config.js` (uses `BACKEND_URL` / `WEBSOCKET_URL` when present).

## Files

- Vite config with Vue plugin: `vite.config.js`
- Entry: `app/frontend/static/js/main.js`
- Vue components: `app/frontend/static/vue/**/*.vue`
- Example component: `app/frontend/static/vue/HelloWorld.vue`
- Feature component: `app/frontend/static/vue/RecommendationsPanel.vue`
- Status widget: `app/frontend/static/vue/SystemStatusCard.vue`
- Composables: `app/frontend/static/vue/composables/*.js`
- Tailwind config: `tailwind.config.js`
- Example template mount: `app/frontend/templates/pages/recommendations.html`
- Base template mount: `app/frontend/templates/base.html` (`data-vue-root="mobile-nav"`).
- System status mounts: `app/frontend/templates/pages/generate.html` & `generate-composition-example.html` (`data-vue-root="system-status-card"`).
- Vue unit tests: `tests/vue/*.spec.js`
- Vitest config: `vitest.config.js`
- Vitest setup: `tests/setup/vitest.setup.js`

## Install & Run

1. Install deps (adds Vue + plugin):
   - `npm install`
2. Start dev servers:
   - Frontend: `npm run dev`
   - Backend (optional): `npm run dev:backend`
3. Open the Recommendations page; you should see the HelloWorld Vue island.
4. Run Vue unit tests (optional):
   - Once: `npm run test:unit:vue`
   - Watch: `npm run test:watch:vue`

## Adding a New Vue Island

1. Create a component under `app/frontend/static/vue/` (e.g., `FeaturePanel.vue`).
2. Add a mount point to the Jinja template: `<div data-vue-root="feature-panel"></div>`
3. Update `main.js` to mount it:
   ```js
   import FeaturePanel from '../vue/FeaturePanel.vue';
   mountVueApp('[data-vue-root="feature-panel"]', FeaturePanel);
   ```

Mount behavior:
- The helper in `main.js` tries immediate mount, then falls back on `DOMContentLoaded` to support late-inserted DOM.
- Scope every island with a unique `data-vue-root` value to avoid clashes and to keep Alpine behavior intact.

### Example: Recommendations Panel

- Mount point: add `<div data-vue-root="recommendations-panel"></div>` in a template (already added to `app/frontend/templates/pages/recommendations.html:8`).
- Component file: `app/frontend/static/vue/RecommendationsPanel.vue`.
- Data fetches:
  - LoRAs: `GET /api/v1/adapters?per_page=100`.
  - Similar: `GET /api/v1/recommendations/similar/{lora_id}?limit=..&similarity_threshold=..`.
  - Weights are UI-only initially; backend defaults apply unless nested query dict parsing is enabled.
  - Note: The current implementation uses native `fetch` directly; the `useApi` composable is available if you prefer.

### Example: Mobile Navigation (Migrated)

- Mount point: add `<div data-vue-root="mobile-nav"></div>` in the base layout (already added to `app/frontend/templates/base.html`).
- Component file: `app/frontend/static/vue/MobileNav.vue`.
- Behavior: mirrors the previous Alpine mobile menu (toggle, overlay, active link highlight based on `window.location.pathname`).

### Example: System Status Card (Migrated)

- Mount points:
  - Simple card in `app/frontend/templates/pages/generate.html`: `<div data-vue-root="system-status-card"></div>`
  - Detailed, collapsible card in `app/frontend/templates/pages/generate-composition-example.html`: `<div data-vue-root="system-status-card" data-variant="detailed"></div>`
- Component file: `app/frontend/static/vue/SystemStatusCard.vue`.
- Behavior: fetches `/system/status`, updates the shared Alpine store for compatibility, and handles 404 fallbacks. The detailed variant preserves the expandable panel UI from Alpine.

## Data Fetching

- Use the included composable for simple fetches: `app/frontend/static/vue/composables/useApi.js`.
- You can switch to Axios later if preferred.

## Next Steps (Phased Plan)

1. First Feature Migration: Continue migrating low-complexity UI to Vue islands (Recommendations panel scaffold complete; iterate on UX/data).
2. Composables: Factor shared API/websocket logic into composables and adopt them across islands.
3. Optional Global State: Add Pinia if/when multiple islands require shared state.
4. Tests: Expand unit tests for new islands and edge cases (Vitest + @vue/test-utils already configured).
5. Routing (later): Consider `vue-router` for SPA-like sections if multiple islands start to coordinate navigation.
6. Cleanup: Remove Alpine/HTMX usage per component once fully migrated; eventually uninstall `alpinejs` and `htmx.org` when complete.

## Notes

- Scope Vue islands with `data-vue-root` to avoid interfering with Alpine.
- Keep using the single `main.js` entry to preserve the Vite manifest integration.
- Tailwind includes `.vue` files; add new paths here if structure changes.
- Dev proxy: Vite proxies `/api` to your FastAPI backend; override with `BACKEND_URL` in `.env` if needed.

## Testing (Vitest)

- Scripts:
  - Run Vue unit tests once: `npm run test:unit:vue`
  - Watch mode: `npm run test:watch:vue`
- Config: `vitest.config.js`
- Setup: `tests/setup/vitest.setup.js`
- Example specs:
  - `tests/vue/HelloWorld.spec.js`
  - `tests/vue/RecommendationsPanel.spec.js`
  - `tests/vue/SystemStatusCard.spec.js`

Troubleshooting:
- If `vitest` is not found, run `npm install` to ensure devDependencies are present.
- If API calls fail in dev, verify `BACKEND_URL` is reachable and Vite proxy is configured.
